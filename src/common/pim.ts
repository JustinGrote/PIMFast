import {
	AuthorizationManagementClient,
	RoleAssignmentScheduleRequest,
	RoleEligibilityScheduleInstance,
} from '@azure/arm-authorization'
import { AccountInfo } from '@azure/msal-browser'
import { AccountInfoTokenCredential } from './auth'

// Scoping to subscription is not needed for the client as we will do it in our requests
const UNSPECIFIED_SUBSCRIPTION_ID = '00000000-0000-0000-0000-000000000000'

let pimClient: AuthorizationManagementClient

/**
 * Returns a singleton AuthorizationManagementClient for the app per best practice
 * @param account The account info.
 */
function getPimClient(account: AccountInfo) {
	if (!pimClient) {
		const credential = new AccountInfoTokenCredential(account)
		pimClient = new AuthorizationManagementClient(credential, UNSPECIFIED_SUBSCRIPTION_ID)
	}
	return pimClient
}

export async function* getRoleEligibilitySchedules(account: AccountInfo, scope: string = '') {
	try {
		const pimClient = getPimClient(account)

		const roleScheduleIterators = []
		// asTarget() is needed or else elevated permissions are required
		roleScheduleIterators.push(pimClient.roleEligibilitySchedules.listForScope(scope, { filter: 'asTarget()' }))

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
export async function* getRoleEligibilityScheduleInstances(account: AccountInfo, scope: string = '') {
	try {
		const pimClient = getPimClient(account)

		const roleScheduleIterators = []
		roleScheduleIterators.push(pimClient.roleEligibilityScheduleInstances.listForScope(scope, { filter: 'asTarget()' }))

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

export async function getRoleManagementPolicyAssignments(
	account: AccountInfo,
	schedule: RoleEligibilityScheduleInstance,
) {
	try {
		if (!schedule.scope || !schedule.roleDefinitionId) {
			throw new Error('Schedule is missing scope or roleDefinitionId')
		}

		const pimClient = getPimClient(account)

		// The policy assignment is linked to the role definition and scope
		const policyAssignments = await pimClient.roleManagementPolicyAssignments.listForScope(schedule.scope)

		// Filter on the client side to get assignments for this role definition
		for await (const assignment of policyAssignments) {
			if (assignment.roleDefinitionId === schedule.roleDefinitionId) {
				console.debug(`Fetched Policy Assignment: ${assignment.id}`)

				// Get the policy details
				if (assignment.policyId) {
					try {
						const policy = await pimClient.roleManagementPolicies.get(schedule.scope, assignment.policyId)
						return {
							assignment,
							policy,
						}
					} catch (policyError) {
						console.error('Error fetching policy details:', policyError)
						return { assignment }
					}
				}

				return { assignment }
			}
		}

		throw new Error('No policy assignments found')
	} catch (err) {
		console.error('Error in getRoleManagementPolicyAssignments:', err)
		throw err
	}
}

export async function getPolicyRequirements(_account: AccountInfo, _schedule: RoleEligibilityScheduleInstance) {
	// FIXME: Implement policy requirement fetching logic
	return {
		requiresJustification: true,
		requiresTicket: false,
		maxDuration: 'PT24H', // Default 1 day
	}
}

export async function activateRole(
	account: AccountInfo,
	scheduleInstance: RoleEligibilityScheduleInstance,
	justification: string,
	ticketNumber?: string,
	startTime?: Date,
	endTime?: Date,
) {
	try {
		if (!scheduleInstance.scope || !scheduleInstance.roleDefinitionId || !scheduleInstance.principalId) {
			throw new Error('Schedule is missing required properties')
		}

		const pimClient = getPimClient(account)

		// Create a role assignment schedule request (activation)
		const requestProperties: RoleAssignmentScheduleRequest = {
			linkedRoleEligibilityScheduleId: scheduleInstance.roleEligibilityScheduleId,
			principalId: account.localAccountId,
			roleDefinitionId: scheduleInstance.roleDefinitionId,
			requestType: 'SelfActivate',
			scheduleInfo: {
				startDateTime: startTime || new Date(),
				expiration: {
					type: 'AfterDateTime',
					endDateTime: endTime,
				},
			},
			justification,
			ticketInfo: ticketNumber ? { ticketNumber } : undefined,
		}

		// Generate a unique name for the request using a UUID
		const requestName = crypto.randomUUID()

		const request = await pimClient.roleAssignmentScheduleRequests.create(
			scheduleInstance.scope,
			requestName,
			requestProperties,
		)

		console.debug(`Created Role Activation Request: ${request.id}`)
		return request
	} catch (err) {
		console.error('Error in createRoleActivationRequest:', err)
		throw err
	}
}

/**
 * Gets the status of a role eligibility schedule request.
 * @param account The account info.
 * @param requestId The ID of the RoleAssignmentScheduleRequest.
 */
export async function getRoleAssignmentScheduleRequest(
	account: AccountInfo,
	requestId: RoleAssignmentScheduleRequestId,
) {
	try {
		const pimClient = getPimClient(account)

		const lastSlash = requestId.lastIndexOf('/')
		const scope = requestId.substring(0, lastSlash)
		const id = requestId.substring(lastSlash + 1)

		const response = await pimClient.roleAssignmentScheduleRequests.get(scope, id)

		console.debug(`Role Assignment Schedule Request ${response.id} is ${response.status}`)

		return response
	} catch (err) {
		console.error('Error in getRoleEligibilityScheduleRequestStatus:', err)
		throw err
	}
}

// These types are useful for uniquely identifying these items without using their objects
export type RoleAssignmentScheduleRequestId = NonNullable<RoleAssignmentScheduleRequest['id']>
export type RoleEligibilityScheduleInstanceId = NonNullable<RoleEligibilityScheduleInstance['id']>