import { getMyRoleEligibilitySchedules } from '@/api/pim'
import { getMyEntraRoleEligibilitySchedules, getMyEntraGroupEligibilitySchedules } from '@/api/pimGraph'
import { getMilliseconds } from '@/api/time'
import { setCommonRoleScheduleAccount } from '@/model/EligibleRole'
import { fromArmSchedule, fromGraphSchedule, fromGroupSchedule, RoleSchedule } from '@/model/RoleSchedule'
import { AccountInfo } from '@azure/msal-browser'
import { useMsal } from '@azure/msal-react'
import { createCollection } from '@tanstack/db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { QueryClient, useQueries, useQuery, useQueryClient, UseQueryOptions } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'

const refetchInterval = getMilliseconds(30, 'seconds')

export function useEligibleRoleLiveQuery() {
	const queryClient = useQueryClient()
	const { accounts } = useMsal()

	/** By using a hash of the unique IDs, this avoids excessively recalculating the collection when account timestamps change
	but does recalculate when accounts are added or removed
	*/
	const accountHomeIdHash = accounts.map(a => a.homeAccountId).join('|')

	// eslint-disable-next-line react-hooks/exhaustive-deps -- Using subset of accounts for dependency
	const queries = useMemo(() => createQueryDefinitions(accounts), [accountHomeIdHash])
	const eligibleRolesQuery = useQueries({
		queries,
		combine: result => {
			return {
				isLoading: result.some(r => r.isLoading),
				data: result.flatMap(r => r.data ?? []),
			}
		},
	})

	const commonOptions = {
		queryKey: ['pim', 'eligibleRoles', accountHomeIdHash],
		enabled: !eligibleRolesQuery.isLoading,
		queryFn: async () => eligibleRolesQuery.data,
		refetchInterval,
	}

	// const eligibleRoleQueryDefinition: UseQueryOptions<RoleSchedule[]> = {
	// 	...commonOptions,
	// }

	// const eligibleRoleQuery = useQuery(eligibleRoleQueryDefinition)
	const collection = useMemo(
		() =>
			createCollection(
				queryCollectionOptions({
					...commonOptions,
					queryClient,
					getKey: role => role.id,
				})
			),
		[queryClient, eligibleRolesQuery.data]
	)

	const liveQuery = useLiveQuery(collection)

	return liveQuery
}

export function createQueryDefinitions(accounts: AccountInfo[]) {
	const armQueries: UseQueryOptions<RoleSchedule[]>[] = accounts.map(account => ({
		queryKey: ['pim', 'armEligibleRoles', account.localAccountId],
		refetchInterval,
		queryFn: async () => {
			const schedules = await Array.fromAsync(getMyRoleEligibilitySchedules(account.localAccountId))
			return schedules.map<RoleSchedule>(schedule => {
				const commonSchedule = fromArmSchedule(schedule)
				setCommonRoleScheduleAccount(commonSchedule, account)
				return commonSchedule
			})
		},
	}))

	const graphQueries: UseQueryOptions<RoleSchedule[]>[] = accounts.map(account => ({
		queryKey: ['pim', 'graphEligibleRoles', account.localAccountId],
		refetchInterval,
		queryFn: async () => {
			const schedules = await getMyEntraRoleEligibilitySchedules(account.localAccountId)
			return schedules.map(schedule => {
				const commonSchedule = fromGraphSchedule(schedule)
				setCommonRoleScheduleAccount(commonSchedule, account)
				return commonSchedule
			})
		},
	}))

	const groupQueries: UseQueryOptions<RoleSchedule[]>[] = accounts.map(account => ({
		queryKey: ['pim', 'groupEligibleRoles', account.localAccountId],
		refetchInterval,
		queryFn: async () => {
			const groupScheduleResult = await getMyEntraGroupEligibilitySchedules(account.localAccountId)
			return groupScheduleResult.map<RoleSchedule>(schedule => {
				const commonSchedule = fromGroupSchedule(schedule)
				setCommonRoleScheduleAccount(commonSchedule, account)
				return commonSchedule
			})
		},
	}))
	return [...armQueries, ...graphQueries, ...groupQueries]
}
