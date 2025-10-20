import { getMyRoleEligibilitySchedules } from '@/api/pim'
import { getMyEntraGroupEligibilitySchedules, getMyEntraRoleEligibilitySchedules } from '@/api/pimGraph'
import { getMilliseconds } from '@/api/time'
import { setRoleScheduleAccount } from '@/model/EligibleRole'
import { fromArmSchedule, fromGraphSchedule, fromGroupSchedule, RoleSchedule } from '@/model/RoleSchedule'
import { AccountInfo } from '@azure/msal-browser'
import { useMsal } from '@azure/msal-react'
import { createCollection } from '@tanstack/db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { useLiveQuery } from '@tanstack/react-db'
import { useQueries, useQueryClient, UseQueryOptions } from '@tanstack/react-query'
import { useMemo } from 'react'
const refetchInterval = getMilliseconds(30, 'seconds')

export function useEligibleRoleLiveQuery() {
	const queryClient = useQueryClient()
	const { accounts } = useMsal()

	/** By using a hash of the unique IDs, this avoids excessively recalculating the collection when account timestamps change
	but does recalculate when accounts are added or removed
	*/
	const accountHomeIdHash = accounts.map(a => a.homeAccountId).join('|')

	// eslint-disable-next-line react-hooks/exhaustive-deps -- Using subset of accounts to avoid unnecessary re-renders due to timestamp changes
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

	const collection = useMemo(
		() =>
			createCollection(
				queryCollectionOptions({
					// eslint-disable-next-line @tanstack/query/exhaustive-deps -- Using subset of accounts to avoid unnecessary re-renders due to timestamp changes
					queryKey: ['pim', 'eligibleRoles', accountHomeIdHash],
					enabled: !eligibleRolesQuery.isLoading,
					queryFn: async () => eligibleRolesQuery.data,
					refetchInterval,
					queryClient,
					getKey: role => role.id,
				})
			),
		[queryClient, accountHomeIdHash, eligibleRolesQuery.data, eligibleRolesQuery.isLoading]
	)

	const liveQuery = useLiveQuery(collection)
	return liveQuery
}

export function createQueryDefinitions(accounts: AccountInfo[]) {
	// NOTE: This is used to ensure the queries are returned in a stable order
	const queries: UseQueryOptions<RoleSchedule[]>[] = []

	for (const account of accounts) {
		queries.push({
			queryKey: ['pim', 'graphEligibleRoles', account.homeAccountId],
			refetchInterval,
			queryFn: async () => {
				const schedules = await getMyEntraRoleEligibilitySchedules(account.localAccountId)
				return schedules.map(schedule => {
					const commonSchedule = fromGraphSchedule(schedule)
					setRoleScheduleAccount(commonSchedule, account)
					return commonSchedule
				})
			},
		})

		queries.push({
			queryKey: ['pim', 'armEligibleRoles', account.homeAccountId],
			refetchInterval,
			queryFn: async () => {
				const schedules = await Array.fromAsync(getMyRoleEligibilitySchedules(account.localAccountId))
				return schedules.map<RoleSchedule>(schedule => {
					const commonSchedule = fromArmSchedule(schedule)
					setRoleScheduleAccount(commonSchedule, account)
					return commonSchedule
				})
			},
		})

		queries.push({
			queryKey: ['pim', 'groupEligibleRoles', account.homeAccountId],
			refetchInterval,
			queryFn: async () => {
				const groupScheduleResult = await getMyEntraGroupEligibilitySchedules(account.localAccountId)
				return groupScheduleResult.map<RoleSchedule>(schedule => {
					const commonSchedule = fromGroupSchedule(schedule)
					setRoleScheduleAccount(commonSchedule, account)
					return commonSchedule
				})
			},
		})
	}

	return queries
}