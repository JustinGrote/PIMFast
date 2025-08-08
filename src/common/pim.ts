import { AuthorizationManagementClient } from '@azure/arm-authorization'
import { AccountInfoTokenCredential } from './auth'
import { AccountInfo } from '@azure/msal-browser'

export async function* getRoleEligibilitySchedules(account: AccountInfo, scope: string = '') {
	try {
		const credential = new AccountInfoTokenCredential(account)
		const unspecifiedSubscriptionId = '00000000-0000-0000-0000-000000000000'
		const pimClient = new AuthorizationManagementClient(credential, unspecifiedSubscriptionId)

		const roleScheduleIterators = []
		roleScheduleIterators.push(pimClient.roleAssignmentScheduleInstances.listForScope(scope, { filter: 'asTarget()' }))

		for await (const iterator of roleScheduleIterators) {
			for await (const roleSchedule of iterator) {
				console.debug(`Fetched Role Schedule: ${roleSchedule.scope} [${roleSchedule.name}]`)
				yield roleSchedule
			}
		}
	} catch (err) {
		console.error('Error in getRoleEligibilitySchedules:', err)
	}
}
