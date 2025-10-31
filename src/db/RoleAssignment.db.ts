import { getMilliseconds } from '@/api/time'
import { throwIfNotError } from '@/api/util'
import {
	CommonRoleAssignmentScheduleInstance,
	fromArmAssignment,
	fromGraphAssignment,
	fromGroupAssignment,
} from '@/model/CommonRoleAssignmentScheduleInstance'
import { AccountInfo } from '@azure/msal-browser'
import { useMsal } from '@azure/msal-react'
import { createCollection, type ChangeMessage } from '@tanstack/db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { useLiveQuery } from '@tanstack/react-db'
import { useQueries, useQueryClient, UseQueryOptions } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { getMyRoleAssignmentScheduleInstances } from '@/api/pim'
import { getMyEntraGroupAssignmentScheduleInstances, getMyEntraRoleAssignmentScheduleInstances } from '@/api/pimGraph'

const refetchInterval = getMilliseconds(5, 'seconds')

export function useRoleAssignmentLiveQuery(_accountsHash: string) {
	const queryClient = useQueryClient()
	const { accounts } = useMsal()
	const [queryKey] = useState(() => ['pim', 'roleAssignmentInstances'])

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
						queries.flatMap(q => queryClient.getQueryData<CommonRoleAssignmentScheduleInstance[]>(q.queryKey) ?? []),
					queryClient,
					getKey: instance => instance.id,
				})
			),
		[queryClient, queryKey]
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
			(changes: ChangeMessage<CommonRoleAssignmentScheduleInstance, string | number>[]) =>
				changes.forEach(change => console.log(`🪧 RoleAssignment ${change.type}: ${change.key}`))
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
	const queries: UseQueryOptions<CommonRoleAssignmentScheduleInstance[]>[] = []

	for (const account of accounts) {
		queries.push({
			queryKey: ['pim', 'armRoleScheduleInstances', account.localAccountId],
			refetchInterval,
			queryFn: async () => {
				const instances = await Array.fromAsync(getMyRoleAssignmentScheduleInstances(account.localAccountId))
				return instances.map(fromArmAssignment)
			},
		})

		queries.push({
			queryKey: ['pim', 'graphRoleScheduleInstances', account.localAccountId],
			refetchInterval,
			queryFn: async () => {
				const instances = await getMyEntraRoleAssignmentScheduleInstances(account.localAccountId)
				return instances.map(fromGraphAssignment)
			},
		})

		queries.push({
			queryKey: ['pim', 'groupRoleScheduleInstances', account.localAccountId],
			refetchInterval,
			queryFn: async () => {
				const instances = await getMyEntraGroupAssignmentScheduleInstances(account.localAccountId)
				return instances.map(fromGroupAssignment)
			},
		})
	}

	return queries
}
