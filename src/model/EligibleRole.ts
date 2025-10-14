import { AccountInfo } from '@azure/msal-browser'
import { CommonRoleSchedule } from './CommonRoleSchedule'

const commonRoleScheduleAccountMap = new Map<CommonRoleSchedule, AccountInfo>()

/**
 * Stores the account associated with a common role schedule.
 * // schedule - The schedule reference to associate
 * // account - The account returned from MSAL for the schedule owner
 */
export const setCommonRoleScheduleAccount = (schedule: CommonRoleSchedule, account: AccountInfo | undefined) => {
	if (!account) {
		commonRoleScheduleAccountMap.delete(schedule)
		return
	}
	commonRoleScheduleAccountMap.set(schedule, account)
}

/**
 * Retrieves the account previously associated with a schedule.
 * // schedule - The schedule reference to lookup
 */
export const getCommonRoleScheduleAccount = (schedule: CommonRoleSchedule) => commonRoleScheduleAccountMap.get(schedule)

/** A reduced set of Account Info that redacts sensitive info and has less changes */
export type AccountInfoDisplay = Pick<
	AccountInfo,
	'name' | 'username' | 'tenantId' | 'homeAccountId' | 'localAccountId'
>

export type AccountInfoOrId = AccountInfo | AccountInfo['localAccountId']
