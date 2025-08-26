/** Parse an Azure Resource ID into its component parts. Supports management groups, tenants, resource groups, resources, and child resources. */

import { throwIfNotError } from './util'

/**
 * Base class for Azure Resource IDs
 */
export class AzureResourceIdBase {
	constructor(
		public readonly resourceId: string,
		public readonly id: string,
	) {}
}

export class TenantId extends AzureResourceIdBase {
	constructor(resourceId: string, id: string) {
		super(resourceId, id)
	}
}

export class ManagementGroupId extends AzureResourceIdBase {
	constructor(resourceId: string, id: string) {
		super(resourceId, id)
	}
}

export class SubscriptionId extends AzureResourceIdBase {
	constructor(resourceId: string, id: string) {
		super(resourceId, id)
	}
}

export class ResourceGroupId extends SubscriptionId {
	constructor(
		resourceId: string,
		id: string,
		public readonly subscription: string,
	) {
		super(resourceId, id)
	}
}

export class ResourceId extends ResourceGroupId {
	constructor(
		resourceId: string,
		id: string,
		subscription: string,
		public readonly provider: string,
		public readonly type: string,
		public readonly resourceGroup: string,
	) {
		super(resourceId, id, subscription)
	}
}

export class ChildResourceId extends ResourceId {
	constructor(
		resourceId: string,
		id: string,
		subscription: string,
		provider: string,
		type: string,
		resourceGroup: string,
		public readonly parentResource: string,
	) {
		super(resourceId, id, subscription, provider, type, resourceGroup)
	}
}

export type AzureResourceId =
	| TenantId
	| ManagementGroupId
	| SubscriptionId
	| ResourceGroupId
	| ResourceId
	| ChildResourceId

export type AzureSubscriptionScopedResourceId = SubscriptionId | ResourceGroupId | ResourceId | ChildResourceId

/** Parse an Azure Resource ID into its component parts. Supports management groups, tenants, resource groups, resources, and child resources. */

export function parseResourceId(resourceId: string): AzureResourceId {
	/**
	 * Patterns:
	 * - Tenant: /tenants/{tenantId}
	 * - Management Group: /providers/Microsoft.Management/managementGroups/{mgId}
	 * - Subscription: /subscriptions/{subId}
	 * - Resource Group: /subscriptions/{subId}/resourceGroups/{rg}
	 * - Resource: /subscriptions/{subId}/resourceGroups/{rg}/providers/{provider}/{type}/{name}
	 * - Child Resource: /subscriptions/{subId}/resourceGroups/{rg}/providers/{provider}/{type}/{name}/{childType}/{childName}
	 */

	const patterns = [
		{
			// Tenant
			regex: /^\/tenants\/(?<id>[^/]+)$/,
			handler: (m: RegExpMatchArray) => {
				return new TenantId(resourceId, m.groups!.id)
			},
		},
		{
			// Management Group
			regex: /^\/providers\/Microsoft\.Management\/managementGroups\/(?<id>[^/]+)$/,
			handler: (m: RegExpMatchArray) => {
				return new ManagementGroupId(resourceId, m.groups!.id)
			},
		},
		{
			// Subscription
			regex: /^\/subscriptions\/(?<id>[^/]+)$/,
			handler: (m: RegExpMatchArray) => {
				return new SubscriptionId(resourceId, m.groups!.id)
			},
		},
		{
			// Resource Group
			regex: /^\/subscriptions\/(?<subscription>[^/]+)\/resourceGroups\/(?<id>[^/]+)$/,
			handler: (m: RegExpMatchArray) => {
				return new ResourceGroupId(resourceId, m.groups!.id, m.groups!.subscription)
			},
		},
		{
			// Resource
			regex:
				/^\/subscriptions\/(?<subscription>[^/]+)\/resourceGroups\/(?<resourceGroup>[^/]+)\/providers\/(?<provider>[^/]+)\/(?<type>[^/]+)\/(?<id>[^/]+)$/,
			handler: (m: RegExpMatchArray) => {
				return new ResourceId(
					resourceId,
					m.groups!.id,
					m.groups!.subscription,
					m.groups!.provider,
					m.groups!.type,
					m.groups!.resourceGroup,
				)
			},
		},
		{
			// Child Resource
			regex:
				/^\/subscriptions\/(?<subscription>[^/]+)\/resourceGroups\/(?<rg>[^/]+)\/providers\/(?<provider>[^/]+)\/(?<type>[^/]+)\/(?<name>[^/]+)\/(?<childType>[^/]+)\/(?<id>[^/]+)$/,
			handler: (m: RegExpMatchArray) => {
				return new ChildResourceId(
					resourceId,
					m.groups!.id,
					m.groups!.subscription,
					m.groups!.provider,
					m.groups!.type,
					m.groups!.rg,
					m.groups!.name,
				)
			},
		},
	]

	for (const { regex, handler } of patterns) {
		const match = resourceId.match(regex)
		if (match && match.groups) return handler(match)
	}

	throw new Error(
		`${resourceId} is not a valid Azure Resource ID. Supported formats: tenant, management group, subscription, resource group, resource, child resource.`,
	)
}

/**
 * Generates the Azure portal URL for a given scope
 * @param scope The resource scope/ID
 * @param scopeType The type of scope (subscription, resourcegroup, managementgroup)
 */
export function getAzurePortalUrl(scope: string, scopeType?: string): string {
	const baseUrl = 'https://portal.azure.com/#@/resource'

	// For management groups, use a different URL pattern
	if (scopeType === 'managementgroup') {
		const mgId = scope.split('/').pop()
		return `https://portal.azure.com/#view/Microsoft_Azure_ManagementGroups/ManagementGroupDrilldownMenuBlade/~/overview/mgId/${mgId}`
	}

	return `${baseUrl}${scope}`
}

/**
 * Parses an Azure portal URL and extracts the resource ID
 * @param portalUrl The Azure portal URL
 * @returns The extracted resource ID
 */
/**
 * Parses an Azure portal URL and extracts the resource ID
 * @param portalUrl The Azure portal URL
 * @returns The extracted resource ID
 */
export function getResourceIdFromPortalUrl(portalUrl: string): string {
	try {
		const url = new URL(portalUrl)
		if (url.hostname !== 'portal.azure.com') throw new Error('Does not begin with portal.azure.com')
		// NOTE: The regex below looks for a word after the resource ID like "overview" etc. because the portal usually has these here. This is probably fragile.
		const resourceIdMatch = url.hash?.match(/#@(?<tenant>[^/]+)?\/resource(?<resourceId>\/.+)\/[^/]+?$/)

		if (resourceIdMatch === null) {
			throw new Error('Could not extract base resource ID from url')
		}
		const { resourceId: resourceIdBase } = resourceIdMatch.groups!
		let resourceId: string | undefined

		try {
			parseResourceId(resourceIdBase)
			resourceId = resourceIdBase // Validate the resource ID format
		} catch {
			// Try splitting on the last slash and parsing the first part
			const parts = resourceIdBase.split('/')
			if (parts.length > 1) {
				parseResourceId(parts[0])
				resourceId = parts[0]
			}
		}

		if (!resourceId) {
			throw new Error('Unable to extract resource ID from portal URL')
		}
		return resourceId
	} catch (error) {
		throwIfNotError(error)
		throw new Error(`Invalid Azure portal URL ${portalUrl}: ${error.message}`)
	}
}
