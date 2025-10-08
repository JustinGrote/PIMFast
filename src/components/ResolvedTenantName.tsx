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
import { throwError, throwIfNotError, toRecord } from '@/api/util'
import { CommonRoleSchedule } from '@/model/CommonRoleSchedule'
import { getCommonRoleScheduleAccount } from '@/model/EligibleRole'
import { TenantIdDescription } from '@azure/arm-resources-subscriptions'
import { AccountInfo } from '@azure/msal-browser'
import { Skeleton, Text } from '@mantine/core'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { match, P } from 'ts-pattern'

/**
 * Global cache for tenant information, regardless of which account it came from.
 */

type Tenant = Pick<TenantIdDescription, 'tenantId' | 'displayName' | 'defaultDomain' | 'domains'>

/**
 * Renders the resolved tenant display name for the provided schedule.
 */
export default function ResolvedTenantName({ role }: { role: CommonRoleSchedule }) {
	const account = getCommonRoleScheduleAccount(role)

	const { data: tenantInfoLookup, isSuccess: tenantsFetched } = useSuspenseQuery<Record<string, Tenant>>({
		// eslint-disable-next-line @tanstack/query/exhaustive-deps
		queryKey: ['pim', 'tenants', account?.localAccountId ?? 'unknown'],
		queryFn: async () => {
			const resolvedAccount = account ?? throwError('Account required to fetch tenant cache')
			const tenants = await fetchTenants(resolvedAccount)
			return toRecord(tenants, 'tenantId')
		},
		// We will be appending fairly static tenant data to this cache, so it only needs to be fetched once unless it is explicity invalidated
		staleTime: Infinity,
	})

	const {
		data: tenantInfo,
		isLoading,
		error,
	} = useQuery<Tenant>({
		// eslint-disable-next-line @tanstack/query/exhaustive-deps
		queryKey: ['pim', 'tenant', account?.localAccountId ?? 'unknown', role.id],
		enabled: tenantsFetched && Boolean(account),
		retry: false,
		queryFn: async () => {
			const resolvedAccount = account ?? throwError('Account required to fetch tenant info')
			const tenantId = await fetchTenantIdForSchedule(role, resolvedAccount)
			if (tenantInfoLookup[tenantId]) {
				return tenantInfoLookup[tenantId]
			}

			// If the above is not found, it is almost certainly an external tenantId, so we must use an API to fetch info about it.
			try {
				const tenantInfo = await findTenantInformation(resolvedAccount, tenantId)
				const tenant: Tenant = {
					...tenantInfo,
					defaultDomain: tenantInfo.defaultDomainName,
				}

				// Update existing query data with this new tenant info to save on future lookups
				tenantInfoLookup[tenantId] = tenant

				// Convert to TenantIdDescription type
				return tenant
			} catch (error) {
				throwIfNotError(error)
				return {
					tenantId: tenantId,
					displayName: `[Unknown] - ${error.message}`,
				}
			}
		},
	})

	if (!account) {
		return <Text c="yellow">Unknown account</Text>
	}

	if (isLoading) {
		return <Skeleton>Loading Tenant ID</Skeleton>
	}

	if (error) {
		throwIfNotError(error)

		if (error instanceof FetchTenantSubscriptionNotFoundError) {
			return <Text c="yellow">Unknown: No Read Access to Subscription</Text>
		}
		return <Text c="red">Error: {error.message}</Text>
	}

	if (!tenantInfo) {
		return <Text c="red">Error: Tenant information undefined without more specific error. This is a bug.</Text>
	}

	return (
		<Text title={tenantInfo.displayName + ' ' + `{${tenantInfo.tenantId}}`}>
			{tenantInfo.defaultDomain ?? tenantInfo.displayName ?? tenantInfo.tenantId}
		</Text>
	)
}

export class FetchTenantSubscriptionNotFoundError extends Error {
	constructor(message: string) {
		super(message)
	}
}

async function fetchTenantIdForSchedule(role: CommonRoleSchedule, account: AccountInfo): Promise<string> {
	// For non-ARM scopes, assume no B2B is involved and return the account tenant
	// FIXME: B2B Maybe?
	if (role.sourceType !== 'arm') return account.tenantId

	const resourceId = role.scope

	if (resourceId === '/' || resourceId.startsWith('/administrativeUnits/')) {
		return account.tenantId
	}

	const parsedResourceId = parseResourceId(resourceId)
	if (parsedResourceId instanceof TenantId) return account.tenantId

	if (parsedResourceId instanceof ManagementGroupId) {
		const managementGroupInfo = await fetchManagementGroup(account, parsedResourceId.id)
		if (!managementGroupInfo.tenantId)
			throw new Error('Management Group does not have a tenantId, this is probably a bug.')
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
		throw new FetchTenantSubscriptionNotFoundError(
			'Subscription not found in account. Likely the user does not have read access to the subscription.'
		)
	}
	if (!subscription.tenantId) throw new Error('Management Group does not have a tenantId, this is probably a bug.')

	return subscription.tenantId
}
