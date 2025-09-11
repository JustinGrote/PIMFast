import { Subscription, SubscriptionClient, TenantIdDescription } from '@azure/arm-resources-subscriptions'
import { AccountInfo } from '@azure/msal-browser'
import { AccountInfoHomeId, AccountInfoTokenCredential } from './auth'
import { getGraphClient } from './graphClient'

export type TenantInformation = {
	/** Unique identifier of a Microsoft Entra tenant. */
	tenantId: string
	/** Display name of a Microsoft Entra tenant. */
	displayName: string
	/** Name shown to users that sign in to a Microsoft Entra tenant. */
	federationBrandName?: string
	/** Primary domain name of a Microsoft Entra tenant. */
	defaultDomainName?: string
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

export async function fetchSubscriptions(account: AccountInfo): Promise<Subscription[]> {
	const client = getSubscriptionClient(account)
	const subscriptions = await Array.fromAsync(client.subscriptions.list())
	return subscriptions
}

export async function fetchTenants(account: AccountInfo): Promise<TenantIdDescription[]> {
	const client = getSubscriptionClient(account)
	const tenants = await Array.fromAsync(client.tenants.list())
	return tenants
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
		return '[Unknown] - No Read Rights to Scope'
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

export async function findTenantNameByTenantId(account: AccountInfo, tenantId: string): Promise<string | undefined> {
	const tenants = await fetchTenants(account)
	const tenant = tenants.find(({ tenantId: id }) => id === tenantId)
	return tenant?.displayName
}

export function parseSubscriptionIdFromResourceId(resourceId: string): string | null {
	const match = resourceId.match(/subscriptions\/([^/]+)/)
	return match ? match[1] : null
}
