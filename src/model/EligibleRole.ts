import { AccountInfo } from '@azure/msal-browser'
import { RoleSchedule } from './RoleSchedule'

const commonRoleScheduleAccountMap: Record<string, AccountInfo> = {}

/**
 * Stores the account associated with a common role schedule.
 * // schedule - The schedule reference to associate
 * // account - The account returned from MSAL for the schedule owner
 */
export const setCommonRoleScheduleAccount = (schedule: RoleSchedule, account: AccountInfo) => {
	commonRoleScheduleAccountMap[schedule.id] = account
}

/**
 * Retrieves the account previously associated with a schedule.
 * // schedule - The schedule reference to lookup
 */
export const getCommonRoleScheduleAccount = (schedule: RoleSchedule) => commonRoleScheduleAccountMap[schedule.id]

/** A reduced set of Account Info that redacts sensitive info and has less changes */
export type AccountInfoDisplay = Pick<
	AccountInfo,
	'name' | 'username' | 'tenantId' | 'homeAccountId' | 'localAccountId'
>

export type AccountInfoOrId = AccountInfo | AccountInfo['localAccountId']
