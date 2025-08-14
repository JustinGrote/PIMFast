import { Subscription, SubscriptionClient, TenantIdDescription } from '@azure/arm-resources-subscriptions'
import { AccountInfo } from '@azure/msal-browser'
import { Client } from '@microsoft/microsoft-graph-client'
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials'
import { AccountInfoTokenCredential } from './auth'

type TenantCache = {
	tenants: TenantIdDescription[]
}

export type TenantInformation = {
	/** Primary domain name of a Microsoft Entra tenant. */
	defaultDomainName: string
	/** Display name of a Microsoft Entra tenant. */
	displayName: string
	/** Name shown to users that sign in to a Microsoft Entra tenant. */
	federationBrandName: string
	/** Unique identifier of a Microsoft Entra tenant. */
	tenantId: string
}

type AccountInfoHomeId = AccountInfo['homeAccountId']

const graphClients: Map<AccountInfoHomeId, Client> = new Map()

/** Returns a singleton global client, per best practice */
async function getGraphClient(account: AccountInfo): Promise<Client> {
	const cacheKey = account.homeAccountId
	let client: Client | undefined = graphClients.get(cacheKey)
	if (!client) {
		client = Client.initWithMiddleware({
			authProvider: new TokenCredentialAuthenticationProvider(new AccountInfoTokenCredential(account), {
				scopes: ['https://graph.microsoft.com/.default'],
			}),
		})
		graphClients.set(cacheKey, client)
	}
	return client
}

const subscriptionClients: Map<AccountInfoHomeId, SubscriptionClient> = new Map()

/** Returns a singleton global client per account, per best practice */
function getSubscriptionClient(account: AccountInfo): SubscriptionClient {
	const cacheKey = account.homeAccountId
	let client = subscriptionClients.get(cacheKey)
	if (!client) {
		client = new SubscriptionClient(new AccountInfoTokenCredential(account), {})
		subscriptionClients.set(cacheKey, client)
	}
	return client
}

export async function findTenantInformation(account: AccountInfo, tenantId: string) {
	const client = await getGraphClient(account)
	const tenantInfo: TenantInformation = await client
		.api(`/tenantRelationships/findTenantInformationByTenantId(tenantId='${tenantId}')`)
		.get()

	if (!tenantInfo) {
		throw new Error(`Failed to retrieve tenant information for tenantId: ${tenantId}`)
	}

	if (!tenantInfo.displayName) {
		throw new Error(`Failed to retrieve displayName for tenantId: ${tenantId}`)
	}

	return tenantInfo
}

const subscriptionCache: Record<AccountInfoHomeId, Subscription[]> = {}
export async function fetchSubscriptions(account: AccountInfo, forceRefresh = false): Promise<Subscription[]> {
	const key = account.homeAccountId

	if (subscriptionCache[key] && !forceRefresh) {
		return subscriptionCache[key]
	}

	const client = getSubscriptionClient(account)

	const subscriptions = await Array.fromAsync(client.subscriptions.list())
	console.debug('Fetched subscriptions for account:', account.username)
	subscriptionCache[key] = subscriptions
	return subscriptionCache[key]
}

const tenantCache: Record<AccountInfoHomeId, TenantIdDescription[]> = {}
export async function fetchTenants(account: AccountInfo, forceRefresh = false): Promise<TenantIdDescription[]> {
	const key = account.homeAccountId

	if (tenantCache[key] && !forceRefresh) {
		return tenantCache[key]
	}

	const client = getSubscriptionClient(account)

	const tenants = await Array.fromAsync(client.tenants.list())
	console.debug('Fetched tenants for account:', account.username)
	tenantCache[key] = tenants
	return tenantCache[key]
}

/**
 * Gets the tenant display name for a given subscription id.
 * @param account The account info.
 * @param subscriptionId The subscription id to look up.
 * @returns The tenant display name or undefined if not found.
 */
export async function fetchTenantNameBySubscriptionId(
	account: AccountInfo,
	subscriptionId: string,
): Promise<string | undefined> {
	// Use fetchSubscriptions to get the subscription
	const subscriptions = await fetchSubscriptions(account)
	const subscription = subscriptions.find(({ subscriptionId: id }) => id === subscriptionId)
	if (subscription === undefined) {
		throw new Error(
			`Subscription ${subscriptionId} not found in Account subscription list, so we can't get the tenant ID to find it`,
		)
	}

	// If the subscription has a tenantId, use it to find the tenant name
	const { tenantId } = subscription

	if (tenantId === undefined) {
		throw new Error(`Subscription ${subscriptionId} does not have a tenantId, this is a bug and should not happen`)
	}

	// Use fetchTenants to find the tenant with this tenantId
	const tenants = await fetchTenants(account)
	const tenant = tenants.find(({ tenantId: id }) => id === tenantId)
	if (tenant !== undefined) {
		return tenant.displayName
	}

	// If we don't find it in cache, try findTenantInformation
	console.debug(`Couldn't find tenant ${tenantId} in cache, fetching from API`)
	const tenantInfo = await findTenantInformation(account, tenantId)
	if (!tenantInfo) {
		throw 'Failed to retrieve tenant information for tenantId: ' + tenantId
	}

	return tenantInfo.displayName
}

export function parseSubscriptionIdFromResourceId(resourceId: string): string | null {
	const match = resourceId.match(/subscriptions\/([^/]+)/)
	return match ? match[1] : null
}
