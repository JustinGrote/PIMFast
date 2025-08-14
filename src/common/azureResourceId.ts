/** Parse an Azure Resource ID into its component parts. Supports management groups, tenants, resource groups, resources, and child resources. */

/**
 * Types for Azure Resource IDs
 */
export type TenantId = {
	resourceId: string
	id: string
	tenant: string
}

export type ManagementGroupId = {
	scope: string
	id: string
	managementGroup: string
}

export type SubscriptionId = {
	scope: string
	id: string
	subscription: string
}

export type ResourceGroupId = {
	scope: string
	id: string
	subscription: string
	resourceGroup: string
}

export type ResourceId = {
	scope: string
	id: string
	subscription: string
	resourceGroup: string
	provider: string
	type: string
}

export type ChildResourceId = {
	scope: string
	id: string
	subscription: string
	resourceGroup: string
	provider: string
	type: string
	child: string
}

export type AzureResourceId =
	| TenantId
	| ManagementGroupId
	| SubscriptionId
	| ResourceGroupId
	| ResourceId
	| ChildResourceId

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
			regex: /^\/tenants\/([^\/]+)$/,
			handler: (m: RegExpMatchArray): TenantId => ({
				resourceId: `/tenants/${m[1]}`,
				id: m[1],
				tenant: m[1],
			}),
		},
		{
			// Management Group
			regex: /^\/providers\/Microsoft\.Management\/managementGroups\/([^\/]+)$/,
			handler: (m: RegExpMatchArray): ManagementGroupId => ({
				scope: `/providers/Microsoft.Management/managementGroups/${m[1]}`,
				id: m[1],
				managementGroup: m[1],
			}),
		},
		{
			// Subscription
			regex: /^\/subscriptions\/([^\/]+)$/,
			handler: (m: RegExpMatchArray): SubscriptionId => ({
				scope: `/subscriptions/${m[1]}`,
				id: m[1],
				subscription: m[1],
			}),
		},
		{
			// Resource Group
			regex: /^\/subscriptions\/([^\/]+)\/resourceGroups\/([^\/]+)$/,
			handler: (m: RegExpMatchArray): ResourceGroupId => ({
				scope: `/subscriptions/${m[1]}/resourceGroups/${m[2]}`,
				id: m[2],
				subscription: m[1],
				resourceGroup: m[2],
			}),
		},
		{
			// Resource
			regex: /^\/subscriptions\/([^\/]+)\/resourceGroups\/([^\/]+)\/providers\/([^\/]+)\/([^\/]+)\/([^\/]+)$/,
			handler: (m: RegExpMatchArray): ResourceId => ({
				scope: `/subscriptions/${m[1]}/resourceGroups/${m[2]}`,
				id: m[5],
				subscription: m[1],
				resourceGroup: m[2],
				provider: m[3],
				type: m[4],
			}),
		},
		{
			// Child Resource
			regex:
				/^\/subscriptions\/([^\/]+)\/resourceGroups\/([^\/]+)\/providers\/([^\/]+)\/([^\/]+)\/([^\/]+)\/([^\/]+)\/([^\/]+)$/,
			handler: (m: RegExpMatchArray): ChildResourceId => ({
				scope: `/subscriptions/${m[1]}/resourceGroups/${m[2]}/providers/${m[3]}/${m[4]}/${m[5]}`,
				id: m[7],
				subscription: m[1],
				resourceGroup: m[2],
				provider: m[3],
				type: m[6],
				child: m[7],
			}),
		},
	]

	for (const { regex, handler } of patterns) {
		const match = resourceId.match(regex)
		if (match) return handler(match)
	}

	throw new Error(
		'Invalid resource ID format. Supported: tenant, management group, subscription, resource group, resource, child resource.',
	)
}
