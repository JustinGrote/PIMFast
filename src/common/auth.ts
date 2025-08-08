import { AccessToken, TokenCredential } from "@azure/identity"
import {
	AccountInfo,
	AuthenticationResult,
	BrowserAuthOptions,
	LogLevel,
	PublicClientApplication,
} from "@azure/msal-browser"
import {
	AuthenticationProvider,
	AuthenticationProviderOptions,
} from "@microsoft/microsoft-graph-client"

const redirectUri = chrome.identity.getRedirectURL()

// Only one interactive is allowed at a time. We store the interactive here so that it can be awaited as a semaphore
const msalChromeExtensionAuthOptions: BrowserAuthOptions = {
	clientId: "980df394-42ba-4a2c-919c-3e7609f3dbd1",
	redirectUri,
	postLogoutRedirectUri: redirectUri,
	onRedirectNavigate(url) {
		launchChromeWebAuthFlow(url)
			.then(msalInstance.handleRedirectPromise.bind(msalInstance))
			.catch((err) => {
				console.error("Error handling redirect:", err)
			})
	},
}

console.log(
	`Reminder: Azure App Registration with Client ID ${msalChromeExtensionAuthOptions.clientId} needs to have the following redirect and logout URI configured: ${msalChromeExtensionAuthOptions.redirectUri}`
)

const msalInstance = new PublicClientApplication({
	auth: msalChromeExtensionAuthOptions,
	system: {
		loggerOptions: {
			loggerCallback: (level, message, _) => {
				console.log(`[MSAL] ${level}: ${message}`)
			},
			logLevel: LogLevel.Trace,
			piiLoggingEnabled: true,
		},
	},
	cache: {
		cacheLocation: "localStorage",
	},
})

await msalInstance.initialize()

export async function checkIfAuthenticated() {
	await msalInstance.handleRedirectPromise()
	const currentAccount = msalInstance.getActiveAccount()
	const allAccounts = msalInstance.getAllAccounts()
	return !!(currentAccount || allAccounts.length > 0)
}

export async function getChromeExtensionAzureToken() {
	await checkIfAuthenticated()
	console.log("LastAuthCode: " + window.localStorage.getItem("lastAuthCode"))

	const currentAccount = msalInstance.getActiveAccount()
	const allAccounts = msalInstance.getAllAccounts()

	if (currentAccount || allAccounts.length > 0) {
		const activeAccount = currentAccount || allAccounts[0]
		console.log("Using existing account:", activeAccount)
		return msalInstance.acquireTokenSilent({
			scopes: ["https://management.azure.com/.default", "offline_access"],
			account: activeAccount,
		})
	}

	return new Promise<AuthenticationResult>((resolve, reject) => {
		msalInstance.handleRedirectPromise().then(() => {
			msalInstance.acquireTokenRedirect({
				scopes: ["https://management.azure.com/.default", "offline_access"],
				onRedirectNavigate: (url) => {
					launchChromeWebAuthFlow(url)
						.then((authcode) => {
							window.localStorage.setItem("lastAuthCode", authcode) // Store the auth code for debug
							return authcode
						})
						.then(msalInstance.handleRedirectPromise.bind(msalInstance))
						.then((result) => {
							if (!result || !result.account) {
								return false
							}

							resolve(result)
							return true
						})
						.catch(reject)
				},
			})
		})
	})
}

export async function logout(account?: AccountInfo) {
	if (account) {
		msalInstance.logoutRedirect({
			account: account,
		})
	} else {
		msalInstance.logoutRedirect()
	}
	// This is necessary to ensure the logout completes and the cache is cleared
	return await msalInstance.handleRedirectPromise()
}

export async function getAllAccounts(): Promise<AccountInfo[]> {
	return msalInstance.getAllAccounts() ?? []
}

/** A TokenCredential bridge between MSAL.js and the Azure SDK */
export class AccountInfoTokenCredential implements TokenCredential {
	account: AccountInfo

	constructor(account: AccountInfo) {
		this.account = account
	}

	async getToken(scopes: string | string[]): Promise<AccessToken | null> {
		const msalToken = await msalInstance.acquireTokenSilent({
			scopes: Array.isArray(scopes) ? scopes : [scopes],
			account: this.account,
		})
		return {
			tokenType: "Bearer",
			token: msalToken.accessToken,
			expiresOnTimestamp:
				msalToken.expiresOn?.getTime() ?? Date.now() + 3600 * 1000, // Default to 1 hour if not set
		}
	}
}

/** A AuthenticationProvider bridge between MSAL.js and the Graph SDK */
export class AccountInfoAuthProvider
	extends AccountInfoTokenCredential
	implements AuthenticationProvider
{
	async getAccessToken(
		authenticationProviderOptions?: AuthenticationProviderOptions
	): Promise<string> {
		const scopes = authenticationProviderOptions?.scopes ?? [".default"]
		const accessToken = await this.getToken(scopes)
		if (!accessToken) {
			throw new Error(
				`Failed to obtain access token with account ${
					this.account.username
				} for scopes ${scopes.join(", ")}`
			)
		}
		return accessToken.token
	}
}

async function launchChromeWebAuthFlow(url: string) {
	const responseUrl = await chrome.identity.launchWebAuthFlow({
		url: url,
		interactive: true,
	})

	if (!responseUrl) {
		throw new Error("WebAuthFlow failed to return a response URL.")
	}

	// Response urls includes a hash (login, acquire token calls)
	if (!responseUrl.includes("#")) {
		throw new Error(
			"WebAuthFlow response URL does not contain a hash, indicating it was not a login or acquire token call."
		)
	}
	return `#${responseUrl.split("#")[1]}`
}
