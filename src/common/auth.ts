import { AccessToken, TokenCredential } from '@azure/identity'
import {
	AccountInfo,
	AuthenticationResult,
	BrowserAuthOptions,
	LogLevel,
	PublicClientApplication,
} from '@azure/msal-browser'
import { throwError, throwIfNotError } from './util'

export type AccountInfoHomeId = AccountInfo['homeAccountId']

// These are the authorization scopes required for our tasks
export const scopesGraphAndAzure = [
	'https://management.azure.com/user_impersonation',
	'User.Read',
	'CrossTenantInformation.ReadBasic.All',
]

// HACK: We can only have one login at a time so we can have a promise here that we resolve when the login is complete to make the login function below return properly when awaited
let loginPromise: Promise<AuthenticationResult | null> | null = null
let resolveLogin: ((value: AuthenticationResult | null) => void) | null = null
let rejectLogin: ((reason?: unknown) => void) | null = null

function handleLoginComplete(result: AuthenticationResult | null) {
	if (resolveLogin) {
		resolveLogin(result)

		// Reset state
		resolveLogin = null
		rejectLogin = null
		loginPromise = null
	}
}

function handleLoginError(error: Error) {
	if (rejectLogin) {
		rejectLogin(error)

		// Reset state
		resolveLogin = null
		rejectLogin = null
		loginPromise = null
	}
}

export async function login() {
	// Create a new promise if one doesn't exist
	if (!loginPromise) {
		loginPromise = new Promise<AuthenticationResult | null>((resolve, reject) => {
			resolveLogin = resolve
			rejectLogin = reject
		})
	}

	try {
		// This should clear any outstanding requests. If msal.interaction.status is in session storage, it will be cleared using this function. If it is not cleared, the below will fail
		await client.handleRedirectPromise()

		// This is not safe to await, but we have configured the client to populate our promise above
		client
			.acquireTokenRedirect({
				scopes: scopesGraphAndAzure,
				prompt: 'select_account',
			})
			.catch(err => {
				throw err
			})
	} catch (err) {
		throwIfNotError(err)
		handleLoginError(err)
	}

	// Await the login completion
	return loginPromise
}

const msalChromeExtensionAuthOptions: BrowserAuthOptions = {
	clientId: '980df394-42ba-4a2c-919c-3e7609f3dbd1',
	redirectUri: chrome.identity.getRedirectURL('.auth'),
	onRedirectNavigate(url) {
		launchChromeWebAuthFlow(url)
			.then(async responseHash => {
				const response = await client.handleRedirectPromise.bind(client)(responseHash)
				handleLoginComplete(response)
			})
			.catch(async err => {
				// Clear the redirect state so another login can occur
				try {
					const redirectPromiseResult = await client.handleRedirectPromise()
					if (redirectPromiseResult !== null) {
						throw new Error(
							`Cleanup of a failed redirect was supposed to be null but authresult ${redirectPromiseResult.uniqueId} was returned. This is probably a bug`,
						)
					}

					// HACK: "return false" should clear msal.interaction.status from session storage but doesn't, so we do it manually
					Object.keys(sessionStorage).forEach(key => {
						if (key.startsWith('msal.')) {
							sessionStorage.removeItem(key)
						}
					})
					return false
				} catch (handleErr) {
					throwIfNotError(handleErr)
					handleLoginError(
						new Error(
							`Failed to do redirect cleanup: ${handleErr.message}. This happened after login error: ${err.message}`,
						),
					)
				} finally {
					handleLoginError(err)
				}
			})
	},
}

console.log(
	`Reminder: Azure App Registration with Client ID ${msalChromeExtensionAuthOptions.clientId} needs to have the following redirect and logout URI configured: ${msalChromeExtensionAuthOptions.redirectUri}`,
)

const client = new PublicClientApplication({
	auth: msalChromeExtensionAuthOptions,
	system: {
		loggerOptions: {
			loggerCallback: (level, message) => {
				console.log(`[MSAL] ${level}: ${message}`)
			},
			logLevel: LogLevel.Verbose,
			piiLoggingEnabled: true,
		},
	},
	cache: {
		cacheLocation: 'localStorage',
	},
})

await client.initialize()

export const hasAuthenticatedAccounts = () => client.getAllAccounts().length > 0

export async function logout(account: AccountInfo) {
	// TODO: Use the logout URI functionality so a logout is recorded in Azure. This is tricky in an extension though.
	await client.clearCache({
		account: account,
	})
}

export async function getAllAccounts(): Promise<AccountInfo[]> {
	return client.getAllAccounts() ?? []
}

/** A TokenCredential bridge between MSAL.js and the Azure SDK */
export class AccountInfoTokenCredential implements TokenCredential {
	account: AccountInfo

	constructor(account: AccountInfo) {
		this.account = account
	}

	async getToken(scopes: string | string[]): Promise<AccessToken | null> {
		const msalToken = await client.acquireTokenSilent({
			scopes: Array.isArray(scopes) ? scopes : [scopes],
			account: this.account,
		})
		return {
			tokenType: 'Bearer',
			token: msalToken.accessToken,
			expiresOnTimestamp: msalToken.expiresOn?.getTime() ?? Date.now() + 3600 * 1000, // Default to 1 hour if not set
		}
	}
}

/** A AuthenticationProvider bridge between MSAL.js and the Graph SDK */
const getAuthFlowResponseCode = (url: string) =>
	url.includes('#')
		? `#${url.split('#')[1]}`
		: throwError(
				'WebAuthFlow response URL does not contain a hash, indicating it was not a login or acquire token call.',
			)

async function launchChromeWebAuthFlow(url: string) {
	const responseUrl = await chrome.identity.launchWebAuthFlow({
		url: url,
		interactive: true,
	})

	if (!responseUrl) throw new Error('WebAuthFlow failed to return a response URL.')
	return getAuthFlowResponseCode(responseUrl)
}
