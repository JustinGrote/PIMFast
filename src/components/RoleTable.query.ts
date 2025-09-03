import { getMilliseconds } from '@/api/time'
import { fromArmSchedule, fromGraphSchedule, fromGroupSchedule } from '@/model/CommonRoleSchedule'
import { EligibleRole } from '@/model/EligibleRole'
import { KnownStatus, RoleAssignmentScheduleInstance } from '@azure/arm-authorization'
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
	getMyEntraGroupEligibilityScheduleInstances,
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

	type HomeAccountInfoId = AccountInfo['homeAccountId']
	type RoleAssignmentsByAccount = Record<HomeAccountInfoId, RoleAssignmentScheduleInstance[]>
	const roleAssignmentsScheduleInstancesByAccountQuery = useQuery<RoleAssignmentsByAccount>({
		queryKey: ['pim', 'roleAssignmentScheduleInstances', accountsQuery.data],
		enabled: accountsQuery.isSuccess,
		refetchInterval: getMilliseconds(10, 'seconds'),
		queryFn: async () => {
			const accounts = accountsQuery.data ?? []

			// Fetch schedule instances for all accounts in parallel
			const accountSchedulePromises = accounts.map(async account => ({
				account,
				schedules: await Array.fromAsync(getMyRoleAssignmentScheduleInstances(account)),
			}))

			const accountScheduleResults = await Promise.all(accountSchedulePromises)

			// Reconstruct the lookup object
			const roleAssignmentsByAccount: RoleAssignmentsByAccount = {}
			for (const result of accountScheduleResults) {
				roleAssignmentsByAccount[result.account.homeAccountId] = result.schedules
			}

			return roleAssignmentsByAccount
		},
	})

	type RoleToStatusLookup = Record<EligibleRole['id'], RoleAssignmentScheduleInstance | undefined>
	const roleStatusQuery = useQuery<RoleToStatusLookup>({
		queryKey: [
			'pim',
			'eligibleRoleStatus',
			eligibleRolesQuery.data,
			roleAssignmentsScheduleInstancesByAccountQuery.data,
		],
		enabled: eligibleRolesQuery.isSuccess && roleAssignmentsScheduleInstancesByAccountQuery.isSuccess,
		queryFn: () => {
			const roleToStatusLookup: RoleToStatusLookup = {}
			const roleAssignmentAccountMap = roleAssignmentsScheduleInstancesByAccountQuery.data ?? {}
			const eligibleRoles = eligibleRolesQuery.data ?? []

			for (const role of eligibleRoles) {
				// Only ARM-based roles can be checked via role assignment schedule instances
				if (role.schedule.sourceType === 'arm') {
					roleToStatusLookup[role.id] = roleAssignmentAccountMap[role.account.homeAccountId]?.find(
						assignment => assignment.linkedRoleEligibilityScheduleInstanceId === role.schedule.id,
					)
				} else {
					// Graph-based roles would need a different status checking mechanism
					roleToStatusLookup[role.id] = undefined
				}
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
		return roleStatusQuery.data[role.id]?.status === KnownStatus.Provisioned
	}

	/** Azure PIM has a undocumented requirement that a role must be activated at least 5 minutes before it can be deactivated. We use this function to determine if that is the case, for purposes of disabling the stop button for instance */
	function isEligibleRoleNewlyActivated(role: EligibleRole): boolean {
		const AZURE_PIM_MIN_ACTIVATION_TIME = 5
		if (!roleStatusQuery.data) return false
		const startDateTime = roleStatusQuery.data[role.id]?.startDateTime
		if (!startDateTime) return false
		return dayjs().diff(dayjs(startDateTime), 'minutes') < AZURE_PIM_MIN_ACTIVATION_TIME
	}

	return {
		accountsQuery,
		currentTab,
		armEligibleRolesQuery,
		graphEligibleRolesQuery,
		groupEligibleRolesQuery,
		eligibleRolesQuery,
		roleAssignmentsScheduleInstancesByAccountQuery,
		roleStatusQuery,
		deactivateEligibleRoleMutation,
		refresh,
		isEligibleRoleActivated,
		isEligibleRoleNewlyActivated,
	}
}
