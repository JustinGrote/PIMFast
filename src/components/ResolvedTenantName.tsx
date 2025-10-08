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
import { throwIfNotError, toRecord } from '@/api/util'
import { EligibleRole } from '@/model/EligibleRole'
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
 * EligibleRole type with optional schedule property.
 */
export type EligibleRoleWithOptionalSchedule = Omit<EligibleRole, 'schedule'> & Partial<Pick<EligibleRole, 'schedule'>>

/**
 * Renders the resolved tenant display name for either a given accountID or an EligibleRole.
 */
export default function ResolvedTenantName({ role }: { role: EligibleRoleWithOptionalSchedule }) {
	// Will be used to fetch external info if required
	const account: AccountInfo = getAccountByLocalId(role.accountId)

	const { data: tenantInfoLookup, isSuccess: tenantsFetched } = useSuspenseQuery<Record<string, Tenant>>({
		// eslint-disable-next-line @tanstack/query/exhaustive-deps
		queryKey: ['pim', 'tenants', account.localAccountId],
		queryFn: async () => {
			const tenants = await fetchTenants(account)
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
		queryKey: ['pim', 'tenant', role.accountId, role.schedule?.id],
		enabled: tenantsFetched,
		retry: false,
		queryFn: async () => {
			const tenantId = await fetchTenantIdForEligibleRole(role)
			if (tenantInfoLookup[tenantId]) {
				return tenantInfoLookup[tenantId]
			}

			// If the above is not found, it is almost certainly an external tenantId, so we must use an API to fetch info about it.
			try {
				const tenantInfo = await findTenantInformation(getAccountByLocalId(account.localAccountId), tenantId)
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


async function fetchTenantIdForEligibleRole(role: EligibleRoleWithOptionalSchedule): Promise<string> {
	const account: AccountInfo = getAccountByLocalId(role.accountId)
	if (!role.schedule) return account.tenantId // No schedule means no ARM scope, so use account tenant

	// For non-ARM scopes, assume no B2B is involved and return the account tenant
	// FIXME: B2B Maybe?
	if (role.schedule.sourceType !== 'arm') return getAccountByLocalId(role.accountId).tenantId

	const resourceId = role.schedule.scope

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
		throw new FetchTenantSubscriptionNotFoundError('Subscription not found in account. Likely the user does not have read access to the subscription.')
	}
	if (!subscription.tenantId) throw new Error('Management Group does not have a tenantId, this is probably a bug.')

	return subscription.tenantId
}
