import { getMilliseconds } from '@/api/time'
import { throwIfNotError } from '@/api/util'
import {
	CommonRoleAssignmentSchedule,
	fromArmAssignmentSchedule,
	fromGraphAssignmentSchedule,
	fromGroupAssignmentSchedule,
} from '@/model/CommonRoleAssignmentSchedule'
import { AccountInfo } from '@azure/msal-browser'
import { useMsal } from '@azure/msal-react'
import { createCollection, type ChangeMessage } from '@tanstack/db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { useLiveQuery } from '@tanstack/react-db'
import { useQueries, useQueryClient, UseQueryOptions } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { getMyRoleAssignmentSchedules } from '@/api/pim'
import { getMyEntraGroupAssignmentSchedules, getMyEntraRoleAssignmentSchedules } from '@/api/pimGraph'

const refetchInterval = getMilliseconds(5, 'seconds')

export function useRoleSchedulesLiveQuery(_accountsHash: string) {
	const queryClient = useQueryClient()
	const { accounts } = useMsal()
	const [queryKey] = useState(() => ['pim', 'roleSchedules'])

	// Clean up inactive PIM queries
	queryClient.removeQueries({ queryKey: ['pim'], type: 'inactive' })

	const queries = useMemo(() => createQueryDefinitions(accounts), [accounts])
	const queryResults = useQueries({ queries })

	// Create collection once, read data from query cache
	const allPending = queryResults.every(q => q.isPending)
	const collection = useMemo(
		() =>
			createCollection(
				queryCollectionOptions({
					queryKey,
					enabled: allPending,
					queryFn: async () =>
						queries.flatMap(q => queryClient.getQueryData<CommonRoleAssignmentSchedule[]>(q.queryKey) ?? []),
					queryClient,
					getKey: instance => instance.id,
				})
			),
		[queryClient, queryKey, allPending]
	)

	// Refresh the collection query whenever any underlying query updates
	const lastDataUpdates = queryResults.map(r => r.dataUpdatedAt).join('|')
	const isPending = queryResults.some(r => r.isPending)
	useEffect(() => {
		if (isPending) return
		queryClient.refetchQueries({ queryKey })
	}, [queryClient, queryKey, lastDataUpdates, isPending])

	// Optional: log collection changes
	useEffect(() => {
		const { unsubscribe } = collection.subscribeChanges(
			(changes: ChangeMessage<CommonRoleAssignmentSchedule, string | number>[]) =>
				changes.forEach(change => console.log(`🪧 RoleSchedules ${change.type}: ${change.key}`))
		)
		return () => {
			try {
				unsubscribe()
			} catch (err) {
				throwIfNotError(err)
				if (!err.message.includes('emitInner')) {
					throw err
				}
			}
		}
	}, [collection])

	return useLiveQuery(collection)
}

function createQueryDefinitions(accounts: AccountInfo[]) {
	const queries: UseQueryOptions<CommonRoleAssignmentSchedule[]>[] = []

	for (const account of accounts) {
		queries.push({
			queryKey: ['pim', 'armRoleSchedules', account.localAccountId],
			refetchInterval,
			queryFn: async () => {
				const schedules = await Array.fromAsync(getMyRoleAssignmentSchedules(account.localAccountId))
				return schedules.map(fromArmAssignmentSchedule)
			},
		})

		queries.push({
			queryKey: ['pim', 'graphRoleSchedules', account.localAccountId],
			refetchInterval,
			queryFn: async () => {
				const schedules = await getMyEntraRoleAssignmentSchedules(account.localAccountId)
				return schedules.map(fromGraphAssignmentSchedule)
			},
		})

		queries.push({
			queryKey: ['pim', 'groupRoleSchedules', account.localAccountId],
			refetchInterval,
			queryFn: async () => {
				const schedules = await getMyEntraGroupAssignmentSchedules(account.localAccountId)
				return schedules.map(fromGroupAssignmentSchedule)
			},
		})
	}

	return queries
}
