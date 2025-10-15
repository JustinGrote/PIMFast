import { getMilliseconds } from '@/api/time'
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
} from '@/model/CommonRoleAssignmentScheduleInstance'
import { RoleSchedule, fromArmSchedule, fromGraphSchedule, fromGroupSchedule } from '@/model/RoleSchedule'
import { setCommonRoleScheduleAccount } from '@/model/EligibleRole'
import { KnownStatus } from '@azure/arm-authorization'
import { useMsal } from '@azure/msal-react'
import {
	useMutation,
	useQueries,
	useQuery,
	useQueryClient,
	UseQueryOptions,
	UseSuspenseQueryOptions,
} from '@tanstack/react-query'
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

	const armEligibleRoles: UseSuspenseQueryOptions<RoleSchedule[]>[] = accounts.map(account => ({
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

	const graphEligibleRoles: UseSuspenseQueryOptions<RoleSchedule[]>[] = accounts.map(account => ({
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

	const groupEligibleRoles: UseSuspenseQueryOptions<RoleSchedule[]>[] = accounts.map(account => ({
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

	const armRoleSchedules: UseQueryOptions<CommonRoleAssignmentSchedule[]>[] = accounts
		.map(account => account.localAccountId)
		.map(accountId => ({
			queryKey: ['pim', 'armRoleSchedules', accountId],
			refetchInterval,
			queryFn: async () => {
				const schedules = await Array.fromAsync(getMyRoleAssignmentSchedules(accountId))
				return schedules.map(fromArmAssignmentSchedule)
			},
		}))

	const graphRoleSchedules: UseQueryOptions<CommonRoleAssignmentSchedule[]>[] = accounts
		.map(account => account.localAccountId)
		.map(accountId => ({
			queryKey: ['pim', 'graphRoleSchedules', accountId],
			refetchInterval,
			queryFn: async () => {
				const schedules = await getMyEntraRoleAssignmentSchedules(accountId)
				return schedules.map(fromGraphAssignmentSchedule)
			},
		}))

	const groupRoleSchedules: UseQueryOptions<CommonRoleAssignmentSchedule[]>[] = accounts
		.map(account => account.localAccountId)
		.map(accountId => ({
			queryKey: ['pim', 'groupRoleSchedules', accountId],
			refetchInterval,
			queryFn: async () => {
				const schedules = await getMyEntraGroupAssignmentSchedules(accountId)
				return schedules.map(fromGroupAssignmentSchedule)
			},
		}))

	const roleScheduleQuery = useQueries({
		queries: [...armRoleSchedules, ...graphRoleSchedules, ...groupRoleSchedules],
		combine: results => {
			return {
				data: results.flatMap(result => result.data ?? []),
				isLoading: results.some(result => result.isLoading),
			}
		},
	})

	const armRoleScheduleInstances: UseQueryOptions<CommonRoleAssignmentScheduleInstance[]>[] = accounts.map(account => ({
		queryKey: ['pim', 'armRoleScheduleInstances', account.localAccountId],
		refetchInterval,
		queryFn: async () => {
			const instances = await Array.fromAsync(getMyRoleAssignmentScheduleInstances(account.localAccountId))
			return instances.map(fromArmAssignment)
		},
	}))

	const graphRoleScheduleInstances: UseQueryOptions<CommonRoleAssignmentScheduleInstance[]>[] = accounts.map(
		account => ({
			queryKey: ['pim', 'graphRoleScheduleInstances', account.localAccountId],
			refetchInterval,
			queryFn: async () => {
				const instances = await getMyEntraRoleAssignmentScheduleInstances(account.localAccountId)
				return instances.map(fromGraphAssignment)
			},
		})
	)

	const groupRoleScheduleInstances: UseQueryOptions<CommonRoleAssignmentScheduleInstance[]>[] = accounts.map(
		account => ({
			queryKey: ['pim', 'groupRoleScheduleInstances', account.localAccountId],
			refetchInterval,
			queryFn: async () => {
				const instances = await getMyEntraGroupAssignmentScheduleInstances(account.localAccountId)
				return instances.map(fromGroupAssignment)
			},
		})
	)

	const roleAssignmentQuery = useQueries({
		queries: [...armRoleScheduleInstances, ...graphRoleScheduleInstances, ...groupRoleScheduleInstances],
		combine: results => {
			return {
				data: results.flatMap(result => result.data ?? []),
				isLoading: results.some(result => result.isLoading),
				isPending: results.some(result => result.isPending),
			}
		},
	})

	// Must come last because we want the above to prefetch.
	// TODO: Use proper prefetching
	const eligibleRolesQuery = useQueries({
		queries: [...armEligibleRoles, ...graphEligibleRoles, ...groupEligibleRoles],
		combine: results => {
			return {
				data: results.flatMap(result => result.data ?? []),
				isLoading: results.some(result => result.isLoading),
				isPending: results.some(result => result.isPending),
			}
		},
	})

	type RoleToStatusLookup = Record<string, CommonRoleAssignmentScheduleInstance | undefined>

	const roleStatusQuery = useQuery<RoleToStatusLookup>({
		// Key is too big, use last update instead ATM
		queryKey: ['pim', 'eligibleRoleStatus', roleAssignmentQuery.data],
		queryFn: () =>
			toRecord(
				roleAssignmentQuery.data.filter(x => x.linkedRoleEligibilityScheduleInstanceId),
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
	function isEligibleRoleActivated(schedule: RoleSchedule): boolean {
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
	function isEligibleRoleNewlyActivated(schedule: RoleSchedule): boolean {
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
		roleStatusQuery,
		deactivateEligibleRoleMutation,
		refresh,
		isEligibleRoleActivated,
		isEligibleRoleNewlyActivated,
	}
}
