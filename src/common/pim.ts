import {
	AuthorizationManagementClient,
	RoleAssignmentScheduleInstance,
	RoleAssignmentScheduleRequest,
	RoleEligibilityScheduleInstance,
} from '@azure/arm-authorization'
import { AccountInfo } from '@azure/msal-browser'
import { AccountInfoHomeId, AccountInfoTokenCredential } from './auth'

// Scoping to subscription is not needed for the client as we will do it in our requests
const UNSPECIFIED_SUBSCRIPTION_ID = '00000000-0000-0000-0000-000000000000'

const pimClients: Map<AccountInfoHomeId, AuthorizationManagementClient> = new Map()

/**
 * Returns a singleton AuthorizationManagementClient for the app per best practice
 * @param account The account info.
 */
function getPimClient(account: AccountInfo) {
	const cacheKey = account.homeAccountId
	let client: AuthorizationManagementClient | undefined = pimClients.get(cacheKey)
	if (!client) {
		client = new AuthorizationManagementClient(new AccountInfoTokenCredential(account), UNSPECIFIED_SUBSCRIPTION_ID)
		pimClients.set(cacheKey, client)
	}
	return client
}

export async function getMyRoleEligibilitySchedules(account: AccountInfo, scope: string = '') {
	return getPimClient(account).roleEligibilitySchedules.listForScope(scope, { filter: 'asTarget()' })
}

/** Represents roles that can currently be activated right now */
export function getMyRoleEligibilityScheduleInstances(account: AccountInfo, scope: string = '') {
	const iterator = getPimClient(account).roleEligibilityScheduleInstances.listForScope(scope, { filter: 'asTarget()' })
	return iterator
}

export function getMyRoleAssignmentScheduleRequests(account: AccountInfo, scope: string = '') {
	return getPimClient(account).roleAssignmentScheduleRequests.listForScope(scope, { filter: 'asTarget()' })
}

export function filterActivatedRoles(assignment: RoleAssignmentScheduleInstance[]) {
	return assignment.filter(assignment => assignment.assignmentType === 'Activated')
}

export function getEligibleRoleStatus(
	eligibleRole: RoleEligibilityScheduleInstance,
	activations: RoleAssignmentScheduleInstance[] = [],
	requests: RoleAssignmentScheduleRequest[] = [],
) {
	// First check if role is activated. This should be a 1:1 relationship to the schedule, PIM prevents multiple activations
	const activeActivation = activations.find(a => a.linkedRoleEligibilityScheduleInstanceId === eligibleRole.id)
	if (activeActivation)
		return {
			schedule: eligibleRole,
			assignmentOrRequest: activeActivation,
			status: activeActivation.status,
		}

	const sortedActivationRequests = requests
		.filter(request => request.linkedRoleEligibilityScheduleId === eligibleRole.id)

		// Sort by newest created
		// TODO: Some more nuance probably needed here, like for failed requests
		.sort(({ createdOn: a }, { createdOn: b }) => (b?.getTime() ?? 0) - (a?.getTime() ?? 0))

	const mostRecentActivationRequest = sortedActivationRequests.length > 0 ? sortedActivationRequests[0] : undefined

	if (mostRecentActivationRequest) {
		return {
			schedule: eligibleRole,
			assignmentOrRequest: mostRecentActivationRequest,
			status: mostRecentActivationRequest.status,
		}
	}
	return {
		schedule: eligibleRole,
		assignmentOrRequest: undefined,
		status: 'Idle',
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
	duration?: string,
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
					type: 'AfterDuration',
					duration: duration || 'PT5M',
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
	const lastSlash = requestId.lastIndexOf('/')
	const scope = requestId.substring(0, lastSlash)
	const id = requestId.substring(lastSlash + 1)

	return getPimClient(account).roleAssignmentScheduleRequests.get(scope, id)
}

// These types are useful for uniquely identifying these items without using their objects
export type RoleAssignmentScheduleRequestId = NonNullable<RoleAssignmentScheduleRequest['id']>
export type RoleEligibilityScheduleInstanceId = NonNullable<RoleEligibilityScheduleInstance['id']>