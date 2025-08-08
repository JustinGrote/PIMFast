import {
	Subscription,
	SubscriptionClient,
	TenantIdDescription,
} from "@azure/arm-resources-subscriptions"
import { AccountInfo } from "@azure/msal-browser"
import { Client } from "@microsoft/microsoft-graph-client"
import { AccountInfoAuthProvider, AccountInfoTokenCredential } from "./auth"
import { isEmptyObject } from "./util"

type SubscriptionCache = {
	subscriptions: Subscription[]
}

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

async function getGraphClient(account: AccountInfo): Promise<Client> {
	const cacheKey = `graphClient_${account.homeAccountId}`
	let client: Client | undefined = (await chrome.storage.session.get(cacheKey))[
		cacheKey
	]
	if (!client) {
		client = Client.initWithMiddleware({
			authProvider: new AccountInfoAuthProvider(account),
		})
		await chrome.storage.session.set({ [cacheKey]: client })
	}
	return client
}

export async function findTenantInformation(
	account: AccountInfo,
	tenantId: string
) {
	const client = await getGraphClient(account)
	const tenantInfo: TenantInformation = await client
		.api(
			`/tenantRelationships/findTenantInformationByTenantId(tenantId='${tenantId}')`
		)
		.get()

	if (!tenantInfo) {
		throw new Error(
			`Failed to retrieve tenant information for tenantId: ${tenantId}`
		)
	}

	if (!tenantInfo.displayName) {
		throw new Error(`Failed to retrieve displayName for tenantId: ${tenantId}`)
	}

	return tenantInfo
}

export async function fetchSubscriptions(
	account: AccountInfo,
	forceRefresh = false
): Promise<Subscription[]> {
	const key = "subscriptions"
	const client = new SubscriptionClient(new AccountInfoTokenCredential(account))
	if (forceRefresh) {
		await chrome.storage.session.remove(key)
	}
	let subCache: SubscriptionCache = await chrome.storage.session.get(key)
	if (!subCache?.subscriptions || isEmptyObject(subCache?.subscriptions)) {
		const subscriptions = await Array.fromAsync(client.subscriptions.list())
		subCache = { subscriptions }
		console.debug("Fetched subscriptions for account:", account.username)
		await chrome.storage.session.set({ [key]: subCache })
	}
	return subCache.subscriptions
}

export async function fetchTenants(
	account: AccountInfo,
	forceRefresh = false
): Promise<TenantIdDescription[]> {
	const key = "tenants"
	const client = new SubscriptionClient(new AccountInfoTokenCredential(account))
	if (forceRefresh) {
		await chrome.storage.session.remove(key)
	}
	let tenantCache: TenantCache = await chrome.storage.session.get(key)
	if (!tenantCache?.tenants || isEmptyObject(tenantCache?.tenants)) {
		const tenants = await Array.fromAsync(client.tenants.list())
		tenantCache = { tenants }
		console.debug("Fetched tenants for account:", account.username)
		await chrome.storage.session.set({ [key]: tenantCache })
	}
	return tenantCache.tenants
}

/**
 * Gets the tenant display name for a given subscription id.
 * @param account The account info.
 * @param subscriptionId The subscription id to look up.
 * @returns The tenant display name or undefined if not found.
 */
export async function fetchTenantNameBySubscriptionId(
	account: AccountInfo,
	subscriptionId: string
): Promise<string | undefined> {
	// Use fetchSubscriptions to get the subscription
	const subscriptions = await fetchSubscriptions(account)
	for (const sub of subscriptions) {
		if (sub.subscriptionId === subscriptionId) {
			const tenantId = sub.tenantId
			// Use fetchTenants to find the tenant with this tenantId
			for (const tenant of await fetchTenants(account)) {
				const displayName =
					(tenant as any).displayName || (tenant as any).tenantDisplayName
				if (tenant.tenantId === tenantId) {
					return displayName
				}
			}
		}
	}
	return undefined
}

export async function fetchTenantNameByResourceId(
	account: AccountInfo,
	resourceId: string
): Promise<string | undefined> {
	const subscriptionId = parseSubscriptionIdFromResourceId(resourceId)
	if (!subscriptionId) {
		return undefined
	}
	return fetchTenantNameBySubscriptionId(account, subscriptionId)
}

export function parseSubscriptionIdFromResourceId(
	resourceId: string
): string | null {
	const match = resourceId.match(/subscriptions\/([^/]+)/)
	return match ? match[1] : null
}
