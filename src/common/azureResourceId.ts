/** Parse an Azure Resource ID into its component parts. Supports management groups, tenants, resource groups, resources, and child resources. */

/**
 * Base type for Azure Resource IDs
 */
export type AzureResourceIdBase = Readonly<{
	/** Fully qualified resource ID for the resource */
	resourceId: string
	/** GUID identifier for the specific resource (e.g. 123e4567-e89b-12d3-a456-426614174000) */
	id: string
}>

export type TenantId = AzureResourceIdBase
export type ManagementGroupId = AzureResourceIdBase
export type SubscriptionId = AzureResourceIdBase

export type ResourceGroupId = SubscriptionId & Readonly<{
	subscription: string
}>

export type ResourceId = ResourceGroupId & Readonly<{
	provider: string
	type: string
	resourceGroup: string
}>

export type ChildResourceId = ResourceId & Readonly<{
	resource: string
}>

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
			handler: (m: RegExpMatchArray): TenantId => {
				const match = m.groups as TenantId
				return {
					...match,
					resourceId,
				}
			},
		},
		{
			// Management Group
			regex: /^\/providers\/Microsoft\.Management\/managementGroups\/(?<id>[^/]+)$/,
			handler: (m: RegExpMatchArray): ManagementGroupId => {
				const match = m.groups as ManagementGroupId
				return {
					...match,
					resourceId,
				}
			},
		},
		{
			// Subscription
			regex: /^\/subscriptions\/(?<id>[^/]+)$/,
			handler: (m: RegExpMatchArray): SubscriptionId => {
				const match = m.groups as SubscriptionId
				return {
					...match,
					resourceId,
				}
			},
		},
		{
			// Resource Group
			regex: /^\/subscriptions\/(?<subscription>[^/]+)\/resourceGroups\/(?<id>[^/]+)$/,
			handler: (m: RegExpMatchArray): ResourceGroupId => {
				const match = m.groups as ResourceGroupId
				return {
					...match,
					resourceId,
				}
			},
		},
		{
			// Resource
			regex:
				/^\/subscriptions\/(?<subscription>[^/]+)\/resourceGroups\/(?<resourceGroup>[^/]+)\/providers\/(?<provider>[^/]+)\/(?<type>[^/]+)\/(?<id>[^/]+)$/,
			handler: (m: RegExpMatchArray): ResourceId => {
				const match = m.groups as ResourceId
				return {
					...match,
					resourceId,
				}
			},
		},
		{
			// Child Resource
			regex:
				/^\/subscriptions\/(?<subscription>[^/]+)\/resourceGroups\/(?<rg>[^/]+)\/providers\/(?<provider>[^/]+)\/(?<type>[^/]+)\/(?<name>[^/]+)\/(?<childType>[^/]+)\/(?<id>[^/]+)$/,
			handler: (m: RegExpMatchArray): ChildResourceId => {
				const match = m.groups as ChildResourceId
				return {
					...match,
					resourceId,
				}
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