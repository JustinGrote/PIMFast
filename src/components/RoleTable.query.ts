import { getMilliseconds } from '@/api/time'
import { RoleAssignmentStatus } from '@/model/CommonRoleAssignmentScheduleInstance'
import { RoleSchedule } from '@/model/RoleSchedule'
import { KnownStatus } from '@azure/arm-authorization'
import { useMsal } from '@azure/msal-react'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'


// FIXME: Update status to use tanstack DB
// export function useRoleTableQueries() {
// 	const refetchInterval = getMilliseconds(30, 'seconds')
// 	const queryClient = useQueryClient()
// 	const { accounts } = useMsal()

// 	/**
// 	 * Refreshes PIM-related queries.
// 	 */
// 	async function refresh() {
// 		await queryClient.invalidateQueries({ queryKey: ['pim'] })
// 	}

// 	/**
// 	 * Checks if an eligible role is activated.
// 	 * @param role The eligible role to check.
// 	 */
// 	function isEligibleRoleActivated(schedule: RoleSchedule): boolean {
// 		const assignment = roleStatusLookup[schedule.id]
// 		if (!assignment) return false

// 		// Check status based on source type
// 		if (assignment.sourceType === 'arm') {
// 			return assignment.status === KnownStatus.Provisioned
// 		} else {
// 			// For Graph and Group assignments, check if assignmentType indicates active status
// 			const status = assignment.status?.toLowerCase()
// 			return status === 'activated' || status === 'active'
// 		}
// 	}

// 	/**
// 	 * Checks if an eligible role was newly activated (less than 5 minutes ago).
// 	 * @param role The eligible role to check.
// 	 */
// 	function isEligibleRoleNewlyActivated(schedule: RoleSchedule): boolean {
// 		const AZURE_PIM_MIN_ACTIVATION_TIME = 5
// 		const assignment = roleStatusLookup[schedule.id]
// 		if (!assignment || !assignment.startDateTime) return false
// 		return dayjs().diff(dayjs(assignment.startDateTime), 'minutes') < AZURE_PIM_MIN_ACTIVATION_TIME
// 	}

// 	function isEligibleRoleDeactivating(schedule: RoleSchedule): boolean {
// 		return (roleStatusLookup[schedule.id]?.status as RoleAssignmentStatus) === 'Deactivating'
// 	}

// 	return {
// 		accountIds: accounts.map(account => account.localAccountId),
// 		currentTab: undefined, // Placeholder as currentTab logic is commented out
// 		eligibleRolesQuery,
// 		// roleStatusQuery,
// 		// deactivateEligibleRoleMutation,
// 		refresh,
// 		isEligibleRoleActivated,
// 		isEligibleRoleNewlyActivated,
// 		isEligibleRoleDeactivating,
// 	}
// }
