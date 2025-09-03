import { getMilliseconds } from '@/api/time'
import {
	CommonRoleAssignmentScheduleInstance,
	fromArmAssignment,
	fromGraphAssignment,
	fromGroupAssignment,
} from '@/model/CommonRoleAssignmentScheduleInstance'
import { fromArmSchedule, fromGraphSchedule, fromGroupSchedule } from '@/model/CommonRoleSchedule'
import { EligibleRole } from '@/model/EligibleRole'
import { KnownStatus } from '@azure/arm-authorization'
import { AccountInfo } from '@azure/msal-browser'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { getAllAccounts } from '../api/auth'
import {
	deactivateEligibleRole,
	getMyRoleAssignmentScheduleInstances,
	getMyRoleEligibilityScheduleInstances,
} from '../api/pim'
import {
	getMyEntraGroupAssignmentScheduleInstances,
	getMyEntraGroupEligibilityScheduleInstances,
	getMyEntraRoleAssignmentScheduleInstances,
	getMyEntraRoleEligibilityScheduleInstances,
} from '../api/pimGraph'

export function useRoleTableQueries() {
	const refetchInterval = getMilliseconds(30, 'seconds')
	const queryClient = useQueryClient()

	const accountsQuery = useQuery<AccountInfo[]>({
		queryKey: ['pim', 'accounts'],
		queryFn: getAllAccounts,
	})

	const { data: currentTab, refetch } = useQuery<chrome.tabs.Tab | undefined>({
		queryKey: ['currentTab'],
		queryFn: async () => {
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
			return tab
		},
	})

	chrome.tabs.onUpdated.addListener((_tabId, _changeInfo, tab) => {
		// We only care about updates to the active tab for this side panel.
		if (tab.active && tab.windowId === currentTab?.windowId) {
			refetch()
		}
	})

	const armEligibleRolesQuery = useQuery<EligibleRole[]>({
		queryKey: ['pim', 'armEligibleRoles', accountsQuery.data],
		enabled: accountsQuery.isSuccess,
		refetchInterval,
		throwOnError: true,
		queryFn: async () => {
			const accounts = accountsQuery.data ?? []
			const allArmEligibleRoles: EligibleRole[] = []

			await Promise.all(
				accounts.map(async account => {
					const armScheduleInstances = await Array.fromAsync(getMyRoleEligibilityScheduleInstances(account))
					for (const schedule of armScheduleInstances) {
						const commonSchedule = fromArmSchedule(schedule)
						allArmEligibleRoles.push({
							account,
							schedule: commonSchedule,
							id: `${account.homeAccountId}-arm-${commonSchedule.id}`,
						})
					}
				}),
			)

			return allArmEligibleRoles
		},
	})

	const graphEligibleRolesQuery = useQuery<EligibleRole[]>({
		queryKey: ['pim', 'graphEligibleRoles', accountsQuery.data],
		enabled: accountsQuery.isSuccess,
		refetchInterval,
		throwOnError: true,
		queryFn: async () => {
			const accounts = accountsQuery.data ?? []
			const allGraphEligibleRoles: EligibleRole[] = []

			await Promise.all(
				accounts.map(async account => {
					const graphScheduleResult = await getMyEntraRoleEligibilityScheduleInstances(account)
					for (const schedule of graphScheduleResult) {
						const commonSchedule = fromGraphSchedule(schedule)
						allGraphEligibleRoles.push({
							account,
							schedule: commonSchedule,
							id: `${account.homeAccountId}-graph-${commonSchedule.id}`,
						})
					}
				}),
			)

			return allGraphEligibleRoles
		},
	})

	const groupEligibleRolesQuery = useQuery<EligibleRole[]>({
		queryKey: ['pim', 'groupEligibleRoles', accountsQuery.data],
		enabled: accountsQuery.isSuccess,
		refetchInterval,
		throwOnError: true,
		queryFn: async () => {
			const accounts = accountsQuery.data ?? []
			const allGroupEligibleRoles: EligibleRole[] = []

			await Promise.all(
				accounts.map(async account => {
					const groupScheduleResult = await getMyEntraGroupEligibilityScheduleInstances(account)
					for (const schedule of groupScheduleResult) {
						const commonSchedule = fromGroupSchedule(schedule)
						allGroupEligibleRoles.push({
							account,
							schedule: commonSchedule,
							id: `${account.homeAccountId}-group-${commonSchedule.id}`,
						})
					}
				}),
			)

			return allGroupEligibleRoles
		},
	})

	const eligibleRolesQuery = useQuery<EligibleRole[]>({
		queryKey: [
			'pim',
			'eligibleRoles',
			armEligibleRolesQuery.data,
			graphEligibleRolesQuery.data,
			groupEligibleRolesQuery.data,
		],
		enabled: armEligibleRolesQuery.isSuccess && graphEligibleRolesQuery.isSuccess && groupEligibleRolesQuery.isSuccess,
		throwOnError: true,
		queryFn: async () => {
			const armRoles = armEligibleRolesQuery.data ?? []
			const graphRoles = graphEligibleRolesQuery.data ?? []
			const groupRoles = groupEligibleRolesQuery.data ?? []
			return [...armRoles, ...graphRoles, ...groupRoles]
		},
	})

	// ARM role assignment schedule instances
	const armRoleAssignmentsQuery = useQuery<CommonRoleAssignmentScheduleInstance[]>({
		queryKey: ['pim', 'armRoleAssignments', accountsQuery.data],
		enabled: accountsQuery.isSuccess,
		refetchInterval: getMilliseconds(10, 'seconds'),
		queryFn: async () => {
			const accounts = accountsQuery.data ?? []
			const allArmAssignments: CommonRoleAssignmentScheduleInstance[] = []

			await Promise.all(
				accounts.map(async account => {
					const armAssignments = await Array.fromAsync(getMyRoleAssignmentScheduleInstances(account))
					for (const assignment of armAssignments) {
						allArmAssignments.push(fromArmAssignment(assignment))
					}
				}),
			)

			return allArmAssignments
		},
	})

	// Graph role assignment schedule instances
	const graphRoleAssignmentsQuery = useQuery<CommonRoleAssignmentScheduleInstance[]>({
		queryKey: ['pim', 'graphRoleAssignments', accountsQuery.data],
		enabled: accountsQuery.isSuccess,
		refetchInterval: getMilliseconds(10, 'seconds'),
		queryFn: async () => {
			const accounts = accountsQuery.data ?? []
			const allGraphAssignments: CommonRoleAssignmentScheduleInstance[] = []

			await Promise.all(
				accounts.map(async account => {
					const graphAssignments = await getMyEntraRoleAssignmentScheduleInstances(account)
					for (const assignment of graphAssignments) {
						allGraphAssignments.push(fromGraphAssignment(assignment))
					}
				}),
			)

			return allGraphAssignments
		},
	})

	// Group role assignment schedule instances
	const groupRoleAssignmentsQuery = useQuery<CommonRoleAssignmentScheduleInstance[]>({
		queryKey: ['pim', 'groupRoleAssignments', accountsQuery.data],
		enabled: accountsQuery.isSuccess,
		refetchInterval: getMilliseconds(10, 'seconds'),
		queryFn: async () => {
			const accounts = accountsQuery.data ?? []
			const allGroupAssignments: CommonRoleAssignmentScheduleInstance[] = []

			await Promise.all(
				accounts.map(async account => {
					const groupAssignments = await getMyEntraGroupAssignmentScheduleInstances(account)
					for (const assignment of groupAssignments) {
						allGroupAssignments.push(fromGroupAssignment(assignment))
					}
				}),
			)

			return allGroupAssignments
		},
	})

	// Combined role assignments query
	const roleAssignmentsQuery = useQuery<CommonRoleAssignmentScheduleInstance[]>({
		queryKey: [
			'pim',
			'roleAssignments',
			armRoleAssignmentsQuery.data,
			graphRoleAssignmentsQuery.data,
			groupRoleAssignmentsQuery.data,
		],
		enabled:
			armRoleAssignmentsQuery.isSuccess && graphRoleAssignmentsQuery.isSuccess && groupRoleAssignmentsQuery.isSuccess,
		queryFn: async () => {
			const armAssignments = armRoleAssignmentsQuery.data ?? []
			const graphAssignments = graphRoleAssignmentsQuery.data ?? []
			const groupAssignments = groupRoleAssignmentsQuery.data ?? []
			return [...armAssignments, ...graphAssignments, ...groupAssignments]
		},
	})

	type RoleToStatusLookup = Record<EligibleRole['id'], CommonRoleAssignmentScheduleInstance | undefined>
	const roleStatusQuery = useQuery<RoleToStatusLookup>({
		queryKey: ['pim', 'eligibleRoleStatus', eligibleRolesQuery.data, roleAssignmentsQuery.data],
		enabled: eligibleRolesQuery.isSuccess && roleAssignmentsQuery.isSuccess,
		queryFn: () => {
			const roleToStatusLookup: RoleToStatusLookup = {}
			const roleAssignments = roleAssignmentsQuery.data ?? []
			const eligibleRoles = eligibleRolesQuery.data ?? []

			for (const role of eligibleRoles) {
				// Find the matching assignment for this role
				const matchingAssignment = roleAssignments.find(assignment => {
					// For ARM roles, match using linkedRoleEligibilityScheduleInstanceId
					if (role.schedule.sourceType === 'arm' && assignment.sourceType === 'arm') {
						return assignment.linkedRoleEligibilityScheduleInstanceId === role.schedule.id
					}
					// For Graph and Group roles, match by role definition and scope
					if (role.schedule.sourceType === assignment.sourceType) {
						return (
							assignment.roleDefinitionId === role.schedule.roleDefinitionId &&
							assignment.scope === role.schedule.scope &&
							assignment.principalId === role.schedule.principalId
						)
					}
					return false
				})

				roleToStatusLookup[role.id] = matchingAssignment
			}

			return roleToStatusLookup
		},
	})

	const deactivateEligibleRoleMutation = useMutation({
		mutationKey: ['deactivateEligibleRole'],
		mutationFn: deactivateEligibleRole,
	})

	async function refresh() {
		await queryClient.invalidateQueries({ queryKey: ['pim'] })
	}

	function isEligibleRoleActivated(role: EligibleRole): boolean {
		if (!roleStatusQuery.data) return false
		const assignment = roleStatusQuery.data[role.id]
		if (!assignment) return false

		// Check status based on source type
		if (assignment.sourceType === 'arm') {
			return assignment.status === KnownStatus.Provisioned
		} else {
			// For Graph and Group assignments, check if assignmentType indicates active status
			return assignment.status === 'Activated' || assignment.status === 'Active'
		}
	}

	/** Azure PIM has a undocumented requirement that a role must be activated at least 5 minutes before it can be deactivated. We use this function to determine if that is the case, for purposes of disabling the stop button for instance */
	function isEligibleRoleNewlyActivated(role: EligibleRole): boolean {
		const AZURE_PIM_MIN_ACTIVATION_TIME = 5
		if (!roleStatusQuery.data) return false
		const assignment = roleStatusQuery.data[role.id]
		if (!assignment || !assignment.startDateTime) return false
		return dayjs().diff(dayjs(assignment.startDateTime), 'minutes') < AZURE_PIM_MIN_ACTIVATION_TIME
	}

	return {
		accountsQuery,
		currentTab,
		armEligibleRolesQuery,
		graphEligibleRolesQuery,
		groupEligibleRolesQuery,
		eligibleRolesQuery,
		armRoleAssignmentsQuery,
		graphRoleAssignmentsQuery,
		groupRoleAssignmentsQuery,
		roleAssignmentsQuery,
		roleStatusQuery,
		deactivateEligibleRoleMutation,
		refresh,
		isEligibleRoleActivated,
		isEligibleRoleNewlyActivated,
	}
}
