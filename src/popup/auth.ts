import { PublicClientApplication, BrowserAuthOptions, AuthenticationResult, LogLevel, AccountInfo } from "@azure/msal-browser"
import { AccessToken, TokenCredential } from "@azure/identity"
import { AuthorizationManagementClient } from "@azure/arm-authorization";
import { SubscriptionClient } from '@azure/arm-subscriptions';


const redirectUri = chrome.identity.getRedirectURL();

// Only one interactive is allowed at a time. We store the interactive here so that it can be awaited as a semaphore
const msalChromeExtensionAuthOptions: BrowserAuthOptions = {
	clientId: "980df394-42ba-4a2c-919c-3e7609f3dbd1",
	redirectUri,
	postLogoutRedirectUri: redirectUri,
	onRedirectNavigate(url) {
		launchChromeWebAuthFlow(url)
			.then(msalInstance.handleRedirectPromise.bind(msalInstance))
			.catch(err => {
				console.error("Error handling redirect:", err)
			});
	},
}

console.log(`Reminder: Azure App Registration with Client ID ${msalChromeExtensionAuthOptions.clientId} needs to have the following redirect and logout URI configured: ${msalChromeExtensionAuthOptions.redirectUri}`);

const msalInstance = new PublicClientApplication({
	auth: msalChromeExtensionAuthOptions,
	system: {
		loggerOptions: {
			loggerCallback: (level, message, _) => {
				console.log(`[MSAL] ${level}: ${message}`)
			},
			logLevel: LogLevel.Trace,
			piiLoggingEnabled: true
		}
	},
	cache: {
		cacheLocation: "localStorage"
	}
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
			account: activeAccount
		});
	}

	return new Promise<AuthenticationResult>((resolve, reject) => {
		msalInstance.acquireTokenRedirect({
			scopes: ["https://management.azure.com/.default", "offline_access"],
			onRedirectNavigate: (url) => {
				launchChromeWebAuthFlow(url)
					.then(authcode => {
						window.localStorage.setItem('lastAuthCode', authcode) // Store the auth code for debug
						return authcode
					})
					.then(msalInstance.handleRedirectPromise.bind(msalInstance))
					.then(result => {
						if (!result || !result.account) {
							return false
						}

						resolve(result)
						return true
					})
					.catch(reject)
			}
		})
	})
}

export async function logout(account?: AccountInfo) {
	if (account) {
		await msalInstance.logoutRedirect({
			account: account
		})
	} else {
		await msalInstance.logoutRedirect()
	}
}

export async function getAllAccounts(): Promise<AccountInfo[]> {
	return msalInstance.getAllAccounts() ?? []
}

class AccountInfoTokenCredential implements TokenCredential {
	account: AccountInfo;

	constructor(account: AccountInfo) {
		this.account = account;
	}

	async getToken(scopes: string | string[]): Promise<AccessToken | null> {
		const msalToken = await msalInstance.acquireTokenSilent({
			scopes: Array.isArray(scopes) ? scopes : [scopes],
			account: this.account
		})
		return {
			tokenType: "Bearer",
			token: msalToken.accessToken,
			expiresOnTimestamp: msalToken.expiresOn?.getTime()
				?? Date.now() + 3600 * 1000 // Default to 1 hour if not set
		}
	}
}

export async function* getRoleEligibilitySchedules(account: AccountInfo) {
	try {
		const credential = new AccountInfoTokenCredential(account)

		const subClient = new SubscriptionClient(credential);

		const unspecifiedSubscriptionId = '00000000-0000-0000-0000-000000000000'
		const pimClient = new AuthorizationManagementClient(credential, unspecifiedSubscriptionId);

		const subscriptionList = [];
		let count = 0;
		for await (const sub of subClient.subscriptions.list()) {
			subscriptionList.push(sub);
			count++;
			if (count >= 2) break;
		}

		const roleScheduleIterators = []
		for (const sub of subscriptionList) {
			const scope = `subscriptions/${sub.subscriptionId}`;
			roleScheduleIterators.push(pimClient.roleAssignmentScheduleInstances.listForScope(scope, { filter: 'asTarget()' }))
		}

		for await (const iterator of roleScheduleIterators) {
			for await (const roleSchedule of iterator) {
				console.debug(`Fetched Role Schedule: ${roleSchedule.scope} [${roleSchedule.name}]`);
				yield roleSchedule;
			}
		}
	} catch (err) {
		console.error("Error in getRoleEligibilitySchedules:", err);
	}
}

async function launchChromeWebAuthFlow(url: string) {
	const responseUrl = await chrome.identity.launchWebAuthFlow({
		url: url,
		interactive: true
	})

	if (!responseUrl) {
		throw new Error("WebAuthFlow failed to return a response URL.");
	}

		// Response urls includes a hash (login, acquire token calls)
	if (!responseUrl.includes("#")) {
		throw new Error("WebAuthFlow response URL does not contain a hash, indicating it was not a login or acquire token call.");
	}
	return `#${responseUrl.split("#")[1]}`
}
