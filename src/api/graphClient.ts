import { AccountInfo } from '@azure/msal-browser'
import { Client } from '@microsoft/microsoft-graph-client'
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials'
import { AccountInfoHomeId, AccountInfoTokenCredential } from './auth'

const graphClients: Record<AccountInfoHomeId, Client> = {}

/** Returns a singleton global client, per best practice */
export async function getGraphClient(account: AccountInfo): Promise<Client> {
	const cacheKey = account.homeAccountId
	let client: Client | undefined = graphClients[cacheKey]
	if (!client) {
		client = Client.initWithMiddleware({
			authProvider: new TokenCredentialAuthenticationProvider(new AccountInfoTokenCredential(account), {
				scopes: ['https://graph.microsoft.com/.default'],
			}),
		})
		graphClients[cacheKey] = client
	}
	return client
}
