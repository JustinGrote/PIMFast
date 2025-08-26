import {
	ChildResourceId,
	ManagementGroupId,
	parseResourceId,
	ResourceGroupId,
	ResourceId,
	SubscriptionId,
} from '@/api/azureResourceId'
import { fetchManagementGroup } from '@/api/managementGroups'
import { fetchSubscriptions, fetchTenants, findTenantInformation } from '@/api/subscriptions'
import { TenantIdDescription } from '@azure/arm-resources-subscriptions'
import { AccountInfo } from '@azure/msal-browser'
import { Skeleton, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { match, P } from 'ts-pattern'
import { EligibleRole } from './RoleTable'

/**
 * Renders the resolved tenant display name for a given eligible role id.
 */
export default function ResolvedTenantName({
	account,
	roleOrTenantId,
}: {
	account: AccountInfo
	roleOrTenantId: EligibleRole | string
}) {
	const { data: tenants } = useQuery<TenantIdDescription[]>({
		queryKey: ['tenants', account.homeAccountId],
		queryFn: async () => fetchTenants(account),
	})

	const { data: tenantInfo, isFetching } = useQuery<TenantIdDescription>({
		queryKey: ['tenants', 'tenantInfo', roleOrTenantId, tenants],
		queryFn: async () => {
			let tenantId: string
			try {
				if (typeof roleOrTenantId !== 'string') {
					// Get the tenant Id from the eligible role
					const scope = roleOrTenantId.schedule.scope
					if (!scope) throw new Error('Role doesnt have a scope. This should not happen')
					const fetchResult = await fetchTenantIdFromResourceId(account, scope)
					tenantId = fetchResult ?? throwUser(`Failed to retrieve tenant ID for scope ${scope}`)
				} else {
					tenantId = roleOrTenantId
				}

				const tenant = tenants!.find(({ tenantId: id }) => id === tenantId)
				if (tenant) {
					return tenant
				}

				// This path happens if the tenant is not found in the initial list and is probably a non-home tenant
				const tenantInfo = await findTenantInformation(account, tenantId)
				if (!tenantInfo) {
					throw 'Failed to retrieve tenant information for tenantId: ' + tenantId
				}

				// Adapt the return value to match the expected structure
				return {
					id: '/tenants/' + tenantId,
					tenantId: tenantId,
					displayName: tenantInfo.federationBrandName || tenantInfo.displayName || 'Unknown',
					defaultDomain: tenantInfo.defaultDomainName || 'Unknown',
					domains: [tenantInfo.defaultDomainName],
				}
			} catch (err: unknown) {
				const errMessage = match(err)
					.with(P.instanceOf(FetchTenantSubscriptionNotFoundError), () => {
						return '[Unknown] - No Read Access to Scope'
					})
					.otherwise(() => {
						return '[Unknown] - Failed to Retrieve Tenant Information'
					})
				return {
					displayName: errMessage,
					defaultDomain: errMessage,
				}
			}
		},
	})

	if (isFetching) {
		return <Skeleton>Loading Tenant ID</Skeleton>
	}

	return (
		<Text title={tenantInfo?.displayName + ' ' + `{${tenantInfo?.tenantId}}`}>
			{tenantInfo?.defaultDomain ?? 'FETCH PROBLEM THIS IS A BUG'}
		</Text>
	)
}

export class FetchTenantSubscriptionNotFoundError extends Error {
	constructor(message: string) {
		super(message)
	}
}

async function fetchTenantIdFromResourceId(account: AccountInfo, resourceId: string) {
	const parsedResourceId = parseResourceId(resourceId)
	if (parsedResourceId instanceof ManagementGroupId) {
		const managementGroupInfo = await fetchManagementGroup(account, parsedResourceId.id)
		return managementGroupInfo.tenantId
	}

	// Use ts-pattern to match on the instance of resourceId
	const subscriptionId: string | undefined = match(parsedResourceId)
		.with(P.instanceOf(ChildResourceId), ({ subscription }) => subscription)
		.with(P.instanceOf(ResourceId), ({ subscription }) => subscription)
		.with(P.instanceOf(ResourceGroupId), ({ subscription }) => subscription)
		.with(P.instanceOf(SubscriptionId), ({ id }) => id)
		.otherwise(r => {
			return undefined
		})

	if (!subscriptionId) throw new Error('Failed to parse subscription ID from schedule scope')

	// Get the tenantId of the subscription
	const subscriptions = await fetchSubscriptions(account)
	const subscription = subscriptions.find(({ subscriptionId: id }) => id === subscriptionId)
	if (subscription === undefined) {
		throw new Error('SubscriptionId not found')
	}
	return subscription.tenantId
}
function throwUser(message: string): never {
	throw new Error(message)
}