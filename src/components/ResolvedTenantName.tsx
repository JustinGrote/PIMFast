import { getAccountByLocalId } from '@/api/auth'
import {
	ChildResourceId,
	ManagementGroupId,
	parseResourceId,
	ResourceGroupId,
	ResourceId,
	SubscriptionId,
	TenantId,
} from '@/api/azureResourceId'
import { fetchManagementGroup } from '@/api/managementGroups'
import { fetchSubscriptions, fetchTenants, findTenantInformation } from '@/api/subscriptions'
import { AccountInfoOrId, EligibleRole } from '@/model/EligibleRole'
import { TenantIdDescription } from '@azure/arm-resources-subscriptions'
import { AccountInfo } from '@azure/msal-browser'
import { Skeleton, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { match, P } from 'ts-pattern'

/**
 * Renders the resolved tenant display name for a given eligible role id.
 */
export default function ResolvedTenantName({
	account,
	roleOrTenantId,
}: {
	account: AccountInfoOrId
	roleOrTenantId?: EligibleRole | string
}) {
	account = typeof account === 'string' ? getAccountByLocalId(account) : account
	const { data: tenants } = useQuery<TenantIdDescription[]>({
		// eslint-disable-next-line @tanstack/query/exhaustive-deps
		queryKey: ['tenants', account.localAccountId],
		queryFn: async () => fetchTenants(account),
	})

	const { data: tenantInfo, isFetching } = useQuery<TenantIdDescription>({
		// eslint-disable-next-line @tanstack/query/exhaustive-deps
		queryKey: ['tenants', 'tenantInfo', account.tenantId, roleOrTenantId],
		queryFn: async () => {
			let tenantId: string
			if (roleOrTenantId === undefined) {
				tenantId = account.tenantId
			} else if (typeof roleOrTenantId === 'string') {
				tenantId = roleOrTenantId
			} else {
				try {
					// Get the tenant Id from the eligible role
					const scope = roleOrTenantId.schedule.scope
					const fetchResult = await fetchTenantIdFromResourceId(account, scope)
					tenantId = fetchResult ?? throwUser(`Failed to retrieve tenant ID for scope ${scope}`)
				} catch (err: unknown) {
					const errMessage = match(err)
						.with(P.instanceOf(FetchTenantSubscriptionNotFoundError), () => {
							return '[Unknown] - No Read Access to Scope'
						})
						.otherwise(() => {
							return '[Unknown] - Failed to Retrieve Tenant Information'
						})
					return {
						id: '/tenants/unknown',
						tenantId: 'unknown',
						displayName: errMessage,
						defaultDomain: errMessage,
						domains: [errMessage],
					}
				}
			}

			// Now fetch the tenant info using tenantId
			const tenant = tenants!.find(({ tenantId: id }) => id === tenantId)
			if (tenant) {
				return tenant
			}

			// This path happens if the tenant is not found in the initial list and is probably a non-home tenant
			const tenantInfo = await findTenantInformation(getAccountByLocalId(account.localAccountId), tenantId)
			if (!tenantInfo) {
				throw new Error('Failed to retrieve tenant information for tenantId: ' + tenantId)
			}
			// Adapt the return value to match the expected structure
			return {
				id: '/tenants/' + tenantId,
				tenantId: tenantId,
				displayName: tenantInfo.federationBrandName || tenantInfo.displayName || 'Unknown',
				defaultDomain: tenantInfo.defaultDomainName || 'Unknown',
				domains: [tenantInfo.defaultDomainName],
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
	if (resourceId === '/' || resourceId.startsWith('/administrativeUnits/')) {
		return account.tenantId
	}

	const parsedResourceId = parseResourceId(resourceId)
	if (parsedResourceId instanceof TenantId) {
		// Maybefixme?: Use tenant profiles?
		return account.tenantId
	}
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
		.otherwise(() => undefined)

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
