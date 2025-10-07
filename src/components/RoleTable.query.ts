import { getMilliseconds } from '@/api/time';
import { CommonRoleAssignmentScheduleInstance } from '@/model/CommonRoleAssignmentScheduleInstance';
import { fromArmSchedule, fromGraphSchedule, fromGroupSchedule } from '@/model/CommonRoleSchedule';
import { EligibleRole } from '@/model/EligibleRole';
import { KnownStatus } from '@azure/arm-authorization';
import { IPublicClientApplication } from '@azure/msal-browser';
import {
	useMutation,
	useQueries,
	useQuery,
	useQueryClient,
	UseQueryResult,
} from '@tanstack/react-query';
import dayjs from 'dayjs';
import { deactivateEligibleRole, getMyRoleEligibilitySchedules } from '../api/pim';
import {
	getMyEntraGroupEligibilitySchedules,
	getMyEntraRoleEligibilitySchedules,
} from '../api/pimGraph';
import { useMsal } from '@azure/msal-react';

export function useRoleTableQueries(instance: IPublicClientApplication) {
	const refetchInterval = getMilliseconds(30, 'seconds')
	const queryClient = useQueryClient()

	const {accounts} = useMsal()

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

	const armEligibleRolesQueries = useQueries<EligibleRole[]>({
		queries: accounts.map(account => account.localAccountId).map(accountId => ({
			queryKey: ['pim', 'armEligibleRoles', accountId],
			refetchInterval,
			queryFn: async () => {
				const schedules = await Array.fromAsync(getMyRoleEligibilitySchedules(accountId))
				return schedules.map<EligibleRole>(schedule => ({
					accountId: accountId,
					schedule: fromArmSchedule(schedule),
				}))
			},
		})),
	})

	const graphEligibleRolesQueries = useQueries<EligibleRole[]>({
		queries: accounts.map(account => account.localAccountId).map(accountId => ({
			queryKey: ['pim', 'graphEligibleRoles', accountId],
			refetchInterval,
			queryFn: async () => {
				const schedules = await getMyEntraRoleEligibilitySchedules(accountId)
				return schedules.map(schedule => ({
					accountId: accountId,
					schedule: fromGraphSchedule(schedule),
				}))
			},
		})),
	})

	const groupEligibleRolesQueries = useQueries<EligibleRole[]>({
		queries: accounts.map(account => account.localAccountId).map(accountId => ({
			queryKey: ['pim', 'groupEligibleRoles', accountId],
			refetchInterval,
			queryFn: async () => {
				const groupScheduleResult = await getMyEntraGroupEligibilitySchedules(accountId)
				return groupScheduleResult.map<EligibleRole>(schedule => ({
					accountId: accountId,
					schedule: fromGroupSchedule(schedule),
				}))
			},
		})),
	})

	// Simplified: Combine data directly in queryFn, remove verbose enabled check
	const eligibleRolesQuery = useQuery<EligibleRole[]>({
		enabled:
			armEligibleRolesQueries.every(q => q.isSuccess) &&
			graphEligibleRolesQueries.every(q => q.isSuccess) &&
			groupEligibleRolesQueries.every(q => q.isSuccess),
		queryKey: ['pim', 'eligibleRoles'],
		queryFn: () => [
			...(armEligibleRolesQueries as UseQueryResult<EligibleRole[]>[]).flatMap(q => q.data ?? []),
			...(graphEligibleRolesQueries as UseQueryResult<EligibleRole[]>[]).flatMap(q => q.data ?? []),
			...(groupEligibleRolesQueries as UseQueryResult<EligibleRole[]>[]).flatMap(q => q.data ?? []),
		],
	})

	// Assuming roleAssignmentsQuery is meant to be defined similarly; added placeholder for completeness
	const roleAssignmentsQuery = useQuery<CommonRoleAssignmentScheduleInstance[]>({
		queryKey: ['pim', 'roleAssignments'],
		queryFn: async () => {
			// Placeholder: Implement logic to fetch/combine assignments (e.g., from ARM, Graph, Group)
			return []
		},
	})

	type RoleToStatusLookup = Record<EligibleRole['accountId'], CommonRoleAssignmentScheduleInstance | undefined>
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

				roleToStatusLookup[role.accountId] = matchingAssignment
			}

			return roleToStatusLookup
		},
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
	function isEligibleRoleActivated(role: EligibleRole): boolean {
		if (!roleStatusQuery.data) return false
		const assignment = roleStatusQuery.data[role.accountId]
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
	function isEligibleRoleNewlyActivated(role: EligibleRole): boolean {
		const AZURE_PIM_MIN_ACTIVATION_TIME = 5
		if (!roleStatusQuery.data) return false
		const assignment = roleStatusQuery.data[role.accountId]
		if (!assignment || !assignment.startDateTime) return false
		return dayjs().diff(dayjs(assignment.startDateTime), 'minutes') < AZURE_PIM_MIN_ACTIVATION_TIME
	}

	return {
		accountIds: accounts.map(account => account.localAccountId),
		currentTab: undefined, // Placeholder as currentTab logic is commented out
		eligibleRolesQuery,
		roleAssignmentsQuery,
		roleStatusQuery,
		deactivateEligibleRoleMutation,
		refresh,
		isEligibleRoleActivated,
		isEligibleRoleNewlyActivated,
	}
}
