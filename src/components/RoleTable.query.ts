import { getMilliseconds } from '@/api/time';
import { toRecord } from '@/api/util'
import {
	CommonRoleAssignmentSchedule,
	fromArmAssignmentSchedule,
	fromGraphAssignmentSchedule,
	fromGroupAssignmentSchedule,
} from '@/model/CommonRoleAssignmentSchedule'
import {
	CommonRoleAssignmentScheduleInstance,
	fromArmAssignment,
	fromGraphAssignment,
	fromGroupAssignment,
	PrivilegedAccessGroupAssignmentScheduleInstanceExpanded,
	UnifiedRoleAssignmentScheduleInstanceExpanded,
} from '@/model/CommonRoleAssignmentScheduleInstance'
import { CommonRoleSchedule, fromArmSchedule, fromGraphSchedule, fromGroupSchedule } from '@/model/CommonRoleSchedule'
import { setCommonRoleScheduleAccount } from '@/model/EligibleRole'
import { KnownStatus, RoleAssignmentScheduleInstance } from '@azure/arm-authorization'
import { useMsal } from '@azure/msal-react'
import { useMutation, useQueries, useQuery, useQueryClient, UseQueryResult } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
	deactivateEligibleRole,
	getMyRoleAssignmentScheduleInstances,
	getMyRoleAssignmentSchedules,
	getMyRoleEligibilitySchedules,
} from '../api/pim'
import {
	getMyEntraGroupAssignmentScheduleInstances,
	getMyEntraGroupAssignmentSchedules,
	getMyEntraGroupEligibilitySchedules,
	getMyEntraRoleAssignmentScheduleInstances,
	getMyEntraRoleAssignmentSchedules,
	getMyEntraRoleEligibilitySchedules,
} from '../api/pimGraph'

export function useRoleTableQueries() {
	const refetchInterval = getMilliseconds(30, 'seconds')
	const queryClient = useQueryClient()
	const { accounts } = useMsal()

	// const { data: accountIds } = useSuspenseQuery({
	// 	queryKey: ['pim', 'accounts'],
	// 	queryFn: () => accounts,
	// 	select: data => data.map(account => account.localAccountId),
	// })

	// const { data: currentTab } = useSuspenseQuery<chrome.tabs.Tab | undefined>({
	// 	queryKey: ['currentTab'],
	// 	queryFn: async () => {
	// 		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
	// 		return tab
	// 	},
	// })

	// TODO: Make this extension specific
	// chrome.tabs.onUpdated.addListener((_tabId, _changeInfo, tab) => {
	// 	// We only care about updates to the active tab for this side panel.
	// 	if (tab.active && tab.windowId === currentTab?.windowId) {
	// 		updateCurrentTab()
	// 	}
	// })

	const armEligibleRolesQueries = useQueries<CommonRoleSchedule[]>({
		queries: accounts.map(account => ({
			queryKey: ['pim', 'armEligibleRoles', account.localAccountId],
			refetchInterval,
			queryFn: async () => {
				const schedules = await Array.fromAsync(getMyRoleEligibilitySchedules(account.localAccountId))
				return schedules.map<CommonRoleSchedule>(schedule => {
					const commonSchedule = fromArmSchedule(schedule)
					setCommonRoleScheduleAccount(commonSchedule, account)
					return commonSchedule
				})
			},
		})),
	})

	const graphEligibleRolesQueries = useQueries<CommonRoleSchedule[]>({
		queries: accounts.map(account => ({
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
		})),
	})

	const groupEligibleRolesQueries = useQueries<CommonRoleSchedule[]>({
		queries: accounts.map(account => ({
			queryKey: ['pim', 'groupEligibleRoles', account.localAccountId],
			refetchInterval,
			queryFn: async () => {
				const groupScheduleResult = await getMyEntraGroupEligibilitySchedules(account.localAccountId)
				return groupScheduleResult.map<CommonRoleSchedule>(schedule => {
					const commonSchedule = fromGroupSchedule(schedule)
					setCommonRoleScheduleAccount(commonSchedule, account)
					return commonSchedule
				})
			},
		})),
	})

	// Simplified: Combine data directly in queryFn, remove verbose enabled check
	const eligibleRolesQuery = useQuery<CommonRoleSchedule[]>({
		enabled:
			armEligibleRolesQueries.every(q => q.isSuccess) &&
			graphEligibleRolesQueries.every(q => q.isSuccess) &&
			groupEligibleRolesQueries.every(q => q.isSuccess),
		// eslint-disable-next-line @tanstack/query/exhaustive-deps
		queryKey: ['pim', 'eligibleRoles'],
		queryFn: () => [
			//BUG: The cast is needed due to an inaccurate type error from useQueries
			...(armEligibleRolesQueries as UseQueryResult<CommonRoleSchedule[]>[]).flatMap(q => q.data ?? []),
			...(graphEligibleRolesQueries as UseQueryResult<CommonRoleSchedule[]>[]).flatMap(q => q.data ?? []),
			...(groupEligibleRolesQueries as UseQueryResult<CommonRoleSchedule[]>[]).flatMap(q => q.data ?? []),
		],
	})

	// Assuming roleAssignmentsQuery is meant to be defined similarly; added placeholder for completeness
	const armRoleScheduleInstances = useQueries<RoleAssignmentScheduleInstance[]>({
		// TODO: Only run if related Eligible Roles Exist
		queries: accounts
			.map(account => account.localAccountId)
			.map(accountId => ({
				queryKey: ['pim', 'armRoleScheduleInstances', accountId],
				refetchInterval,
				queryFn: async () => {
					const instances = await Array.fromAsync(getMyRoleAssignmentScheduleInstances(accountId))
					return instances
				},
			})),
	})

	const graphRoleScheduleInstances = useQueries<UnifiedRoleAssignmentScheduleInstanceExpanded[]>({
		// TODO: Only run if related Eligible Roles Exist
		queries: accounts
			.map(account => account.localAccountId)
			.map(accountId => ({
				queryKey: ['pim', 'graphRoleScheduleInstances', accountId],
				refetchInterval,
				queryFn: async () => {
					const instances = await getMyEntraRoleAssignmentScheduleInstances(accountId)
					return instances
				},
			})),
	})

	const groupRoleScheduleInstances = useQueries<PrivilegedAccessGroupAssignmentScheduleInstanceExpanded[]>({
		// TODO: Only run if related Eligible Roles Exist
		queries: accounts
			.map(account => account.localAccountId)
			.map(accountId => ({
				queryKey: ['pim', 'groupRoleScheduleInstances', accountId],
				refetchInterval,
				queryFn: async () => {
					const instances = await getMyEntraGroupAssignmentScheduleInstances(accountId)
					return instances
				},
			})),
	})

	const roleAssignmentsQuery = useQuery<CommonRoleAssignmentScheduleInstance[]>({
		enabled:
			armRoleScheduleInstances.every(q => q.isSuccess) &&
			graphRoleScheduleInstances.every(q => q.isSuccess) &&
			groupRoleScheduleInstances.every(q => q.isSuccess),
		// eslint-disable-next-line @tanstack/query/exhaustive-deps
		queryKey: ['pim', 'armRoleAssignmentScheduleInstances'],
		queryFn: () => [
			...(armRoleScheduleInstances as UseQueryResult<RoleAssignmentScheduleInstance[]>[])
				.flatMap(q => q.data ?? [])
				.map(i => fromArmAssignment(i)),
			...(graphRoleScheduleInstances as UseQueryResult<UnifiedRoleAssignmentScheduleInstanceExpanded[]>[])
				.flatMap(q => q.data ?? [])
				.map(i => fromGraphAssignment(i)),
			...(groupRoleScheduleInstances as UseQueryResult<PrivilegedAccessGroupAssignmentScheduleInstanceExpanded[]>[])
				.flatMap(q => q.data ?? [])
				.map(i => fromGroupAssignment(i)),
		],
	})

	const armRoleSchedules = useQueries({
		queries: accounts
			.map(account => account.localAccountId)
			.map(accountId => ({
				queryKey: ['pim', 'armRoleSchedules', accountId],
				refetchInterval,
				queryFn: async () => {
					const schedules = await Array.fromAsync(getMyRoleAssignmentSchedules(accountId))
					return schedules
				},
			})),
	})

	const graphRoleSchedules = useQueries({
		queries: accounts
			.map(account => account.localAccountId)
			.map(accountId => ({
				queryKey: ['pim', 'graphRoleSchedules', accountId],
				refetchInterval,
				queryFn: async () => {
					const schedules = await getMyEntraRoleAssignmentSchedules(accountId)
					return schedules
				},
			})),
	})

	const groupRoleSchedules = useQueries({
		queries: accounts
			.map(account => account.localAccountId)
			.map(accountId => ({
				queryKey: ['pim', 'groupRoleSchedules', accountId],
				refetchInterval,
				queryFn: async () => {
					const schedules = await getMyEntraGroupAssignmentSchedules(accountId)
					return schedules
				},
			})),
	})

	const roleSchedulesQuery = useQuery<CommonRoleAssignmentSchedule[]>({
		enabled:
			armRoleSchedules.every(q => q.isSuccess) &&
			graphRoleSchedules.every(q => q.isSuccess) &&
			groupRoleSchedules.every(q => q.isSuccess),
		queryKey: ['pim', 'roleSchedules'],
		queryFn: () => [
			...armRoleSchedules.flatMap(q => q.data ?? []).map(i => fromArmAssignmentSchedule(i)),
			...graphRoleSchedules.flatMap(q => q.data ?? []).map(i => fromGraphAssignmentSchedule(i)),
			...groupRoleSchedules.flatMap(q => q.data ?? []).map(i => fromGroupAssignmentSchedule(i)),
		],
	})

	type RoleToStatusLookup = Record<string, CommonRoleAssignmentScheduleInstance | undefined>

	const roleStatusQuery = useQuery<RoleToStatusLookup>({
		// Key is too big, use last update instead ATM
		// eslint-disable-next-line @tanstack/query/exhaustive-deps
		queryKey: ['pim', 'eligibleRoleStatus', roleAssignmentsQuery.dataUpdatedAt],
		enabled: roleAssignmentsQuery.isSuccess,
		queryFn: () =>
			toRecord(
				(roleAssignmentsQuery.data ?? []).filter(x => x.linkedRoleEligibilityScheduleInstanceId),
				'linkedRoleEligibilityScheduleInstanceId'
			),
	})

	const deactivateEligibleRoleMutation = useMutation({
		mutationKey: ['deactivateEligibleRole'],
		mutationFn: deactivateEligibleRole,
	})

	/**
	 * Refreshes PIM-related queries.
	 */
	async function refresh() {
		await queryClient.invalidateQueries({ queryKey: ['pim'] })
	}

	/**
	 * Checks if an eligible role is activated.
	 * @param role The eligible role to check.
	 */
	function isEligibleRoleActivated(schedule: CommonRoleSchedule): boolean {
		if (!roleStatusQuery.data) return false
		const assignment = roleStatusQuery.data[schedule.id]
		if (!assignment) return false

		// Check status based on source type
		if (assignment.sourceType === 'arm') {
			return assignment.status === KnownStatus.Provisioned
		} else {
			// For Graph and Group assignments, check if assignmentType indicates active status
			const status = assignment.status?.toLowerCase()
			return status === 'activated' || status === 'active'
		}
	}

	/**
	 * Checks if an eligible role was newly activated (less than 5 minutes ago).
	 * @param role The eligible role to check.
	 */
	function isEligibleRoleNewlyActivated(schedule: CommonRoleSchedule): boolean {
		const AZURE_PIM_MIN_ACTIVATION_TIME = 5
		if (!roleStatusQuery.data) return false
		const assignment = roleStatusQuery.data[schedule.id]
		if (!assignment || !assignment.startDateTime) return false
		return dayjs().diff(dayjs(assignment.startDateTime), 'minutes') < AZURE_PIM_MIN_ACTIVATION_TIME
	}

	return {
		accountIds: accounts.map(account => account.localAccountId),
		currentTab: undefined, // Placeholder as currentTab logic is commented out
		eligibleRolesQuery,
		roleSchedulesQuery,
		roleAssignmentsQuery,
		roleStatusQuery,
		deactivateEligibleRoleMutation,
		refresh,
		isEligibleRoleActivated,
		isEligibleRoleNewlyActivated,
	}
}
