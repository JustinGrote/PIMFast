import { AccountInfo } from '@azure/msal-browser'
import { CommonRoleSchedule } from './CommonRoleSchedule'

/** A role schedule instance and the account which it was fetched from. Needed to preserve context for activation so we know which user the role is valid for */
export interface EligibleRole {
	/** Set to a hyphenated string of account HomeAccountId and schedule Id. Has to be unique for row processing */
	id: string
	account: AccountInfo
	schedule: CommonRoleSchedule
}
