import { AccountInfo } from '@azure/msal-browser'
import { CommonRoleSchedule } from './CommonRoleSchedule'

/** A role schedule instance and the account which it was fetched from. Needed to preserve context for activation so we know which user the role is valid for */
export interface EligibleRole {
	// The local ID of the account
	accountId: string
	schedule: CommonRoleSchedule
}

/** A reduced set of Account Info that redacts sensitive info and has less changes */
export type AccountInfoDisplay = Pick<
	AccountInfo,
	'name' | 'username' | 'tenantId' | 'homeAccountId' | 'localAccountId'
>

export type AccountInfoOrId = AccountInfo | AccountInfo['localAccountId']
