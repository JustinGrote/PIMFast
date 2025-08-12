import {
	AuthorizationManagementClient,
	RoleAssignmentScheduleRequest,
	RoleEligibilityScheduleInstance,
} from '@azure/arm-authorization'
import { AccountInfo } from '@azure/msal-browser'
import { AccountInfoTokenCredential } from './auth'

export async function* getRoleEligibilitySchedules(account: AccountInfo, scope: string = '') {
	try {
		const credential = new AccountInfoTokenCredential(account)
		const unspecifiedSubscriptionId = '00000000-0000-0000-0000-000000000000'
		const pimClient = new AuthorizationManagementClient(credential, unspecifiedSubscriptionId)

		const roleScheduleIterators = []
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
		const credential = new AccountInfoTokenCredential(account)
		const unspecifiedSubscriptionId = '00000000-0000-0000-0000-000000000000'
		const pimClient = new AuthorizationManagementClient(credential, unspecifiedSubscriptionId)

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

		const credential = new AccountInfoTokenCredential(account)
		const unspecifiedSubscriptionId = '00000000-0000-0000-0000-000000000000'
		const pimClient = new AuthorizationManagementClient(credential, unspecifiedSubscriptionId)

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
	return {
		requiresJustification: true,
		requiresTicket: false,
		maxActivationDuration: 8, // Default 8 hours
	}
}

export async function createRoleActivationRequest(
	account: AccountInfo,
	schedule: RoleEligibilityScheduleInstance,
	justification: string,
	ticketNumber?: string,
	startTime?: Date,
	endTime?: Date,
) {
	try {
		if (!schedule.scope || !schedule.roleDefinitionId || !schedule.principalId) {
			throw new Error('Schedule is missing required properties')
		}

		const credential = new AccountInfoTokenCredential(account)
		const unspecifiedSubscriptionId = '00000000-0000-0000-0000-000000000000'
		const pimClient = new AuthorizationManagementClient(credential, unspecifiedSubscriptionId)

		// Create a role assignment schedule request (activation)
		const requestProperties: RoleAssignmentScheduleRequest = {
			linkedRoleEligibilityScheduleId: schedule.roleEligibilityScheduleId,
			principalId: account.localAccountId,
			roleDefinitionId: schedule.roleDefinitionId,
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
			schedule.scope,
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
