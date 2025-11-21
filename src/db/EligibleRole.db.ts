import { getMyRoleEligibilitySchedules } from '@/api/pim'
import { getMyEntraGroupEligibilitySchedules, getMyEntraRoleEligibilitySchedules } from '@/api/pimGraph'
import { getMilliseconds } from '@/api/time'
import { throwIfNotError } from '@/api/util'
import { setRoleScheduleAccount } from '@/model/EligibleRole'
import { fromArmSchedule, fromGraphSchedule, fromGroupSchedule, RoleSchedule } from '@/model/RoleSchedule'
import { AccountInfo } from '@azure/msal-browser'
import { useMsal } from '@azure/msal-react'
import { Collection, createCollection, NonSingleResult, UtilsRecord } from '@tanstack/react-db'
import { queryCollectionOptions, QueryCollectionUtils } from '@tanstack/query-db-collection'
import { useLiveQuery } from '@tanstack/react-db'
import { useQueries, useQueryClient, UseQueryOptions } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
const refetchInterval = getMilliseconds(5, 'seconds')

// NOTE: ResultType does not work as expected so we manually defined this type
type EligibleRoleCollection = Collection<RoleSchedule,string,UtilsRecord & QueryCollectionUtils<RoleSchedule, string, RoleSchedule, unknown>,never,RoleSchedule> & NonSingleResult

// We singleton this at a module level so that the collection isn't recreated on every hook call but can reference updates in the query data from its queryFn since it is outside the closure.
const queryKey = ['pim', 'eligibleRoles']
let queries: UseQueryOptions<RoleSchedule[], Error, RoleSchedule[], readonly unknown[]>[]
let collection: EligibleRoleCollection

export function useEligibleRoleLiveQuery(accountsHash: string) {
	const queryClient = useQueryClient()
	const { accounts } = useMsal()

	// Clean up inactive eligible role queries
	queryClient.removeQueries({ queryKey: ['pim'], type: 'inactive' })

	queries = useMemo(() => createQueryDefinitions(accounts), [accounts, accountsHash])

	// NOTE: This collection is effectively a singleton, it doesn't need recreating when accounts/etc. change
	collection ??= createCollection(
		queryCollectionOptions({
			queryKey,
			queryFn: async () => queries.flatMap(query => queryClient.getQueryData<RoleSchedule[]>(query.queryKey) ?? []),
			queryClient,
			getKey: role => role.id,
		})
	)

	// Refresh the collection query if data has been fetched or has changed
	const queryResults = useQueries({ queries })
	const lastDataUpdates = queryResults.map(result => result.dataUpdatedAt).join('|')
	useEffect(() => {
		queryClient.refetchQueries({ queryKey })
	}, [queryClient, lastDataUpdates])

	// Enable logging of collection changes for debugging
	useEffect(() => {
		const { unsubscribe } = collection.subscribeChanges(changes =>
			changes.forEach(change => console.log(`🪧 EligibleRole ${change.type}: ${change.key}`))
		)

		return () => {
			try {
				unsubscribe()
			} catch (err) {
				throwIfNotError(err)
				// Swallow emitInner errors that indicate collection was already disposed
				if (!err.message.includes('emitInner')) {
					throw err
				}
			}
		}
	}, [])

	const liveQuery = useLiveQuery(collection)
	return liveQuery
}

function createQueryDefinitions(accounts: AccountInfo[]) {
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
