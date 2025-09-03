import {
	PrivilegedAccessGroupAssignmentScheduleInstanceExpanded,
	UnifiedRoleAssignmentScheduleInstanceExpanded,
} from '@/model/CommonRoleAssignmentScheduleInstance'
import { PrivilegedAccessGroupEligibilityScheduleInstanceExpanded } from '@/model/CommonRoleSchedule'
import { EligibleRole } from '@/model/EligibleRole'
import { AccountInfo } from '@azure/msal-browser'
import { AzureIdentityAuthenticationProvider } from '@microsoft/kiota-authentication-azure'
import { FetchRequestAdapter } from '@microsoft/kiota-http-fetchlibrary'
import { AccountInfoHomeId, AccountInfoTokenCredential } from './auth'
import {
	PrivilegedAccessGroupAssignmentScheduleRequest,
	UnifiedRoleAssignmentScheduleRequest,
	UnifiedRoleEligibilityScheduleInstance,
} from './generated/msgraph/models'
import { createPimGraphClient, PimGraphClient } from './generated/msgraph/pimGraphClient'

const graphPimClients: Record<AccountInfoHomeId, PimGraphClient> = {}

export function createPimClient(account: AccountInfo): PimGraphClient {
	try {
		const client = createPimGraphClient(
			new FetchRequestAdapter(new AzureIdentityAuthenticationProvider(new AccountInfoTokenCredential(account))),
		)
		return client
	} catch (error) {
		console.error('Error creating PIM Graph client:', error)
		throw error
	}
}

/** Returns a singleton global client, per best practice */
export function getPimClient(account: AccountInfo): PimGraphClient {
	const cacheKey = account.homeAccountId
	let client: PimGraphClient | undefined = graphPimClients[cacheKey]
	if (!client) {
		client = createPimClient(account)
		graphPimClients[cacheKey] = client
	}
	return client
}

export interface UnifiedRoleEligibilityScheduleInstanceExpanded extends UnifiedRoleEligibilityScheduleInstance {
	roleDefinition: {
		id: string
		displayName: string
		userPrincipalName: string
	}
	principal: {
		id: string
		displayName: string
		userPrincipalName: string
	}
}

/**
 * Retrieves the current user's role eligibility schedule instances from Microsoft Graph PIM.
 *
 * @param account - The Azure MSAL account information for authentication.
 * @returns A promise that resolves to an array of UnifiedRoleEligibilityScheduleInstance objects.
 * @throws Will throw an error if fetching fails.
 */
export async function getMyEntraRoleEligibilityScheduleInstances(
	account: AccountInfo,
): Promise<UnifiedRoleEligibilityScheduleInstanceExpanded[]> {
	try {
		const client = await getPimClient(account)

		const request =
			client.roleManagement.directory.roleEligibilityScheduleInstances.filterByCurrentUserWithOn('principal')
		const response = await request.get({
			queryParameters: {
				expand: ['roleDefinition', 'principal'],
			},
		})

		return (response?.value as UnifiedRoleEligibilityScheduleInstanceExpanded[]) ?? []
	} catch (error) {
		console.error('Error fetching role eligibility schedule instances:', error)
		throw error
	}
}

export async function getMyEntraGroupEligibilityScheduleInstances(
	account: AccountInfo,
): Promise<PrivilegedAccessGroupEligibilityScheduleInstanceExpanded[]> {
	try {
		const client = await getPimClient(account)

		const request =
			client.identityGovernance.privilegedAccess.group.eligibilityScheduleInstances.filterByCurrentUserWithOn(
				'principal',
			)
		const response = await request.get({
			queryParameters: {
				expand: ['group', 'principal'],
			},
		})

		return (response?.value as PrivilegedAccessGroupEligibilityScheduleInstanceExpanded[]) ?? []
	} catch (error) {
		console.error('Error fetching group eligibility schedule instances:', error)
		throw error
	}
}

export const createEntraRoleAssignmentScheduleRequest = (
	account: AccountInfo,
	request: UnifiedRoleAssignmentScheduleRequest,
) => getPimClient(account).roleManagement.directory.roleAssignmentScheduleRequests.post(request)

export const createEntraGroupAssignmentScheduleRequest = (
	account: AccountInfo,
	request: PrivilegedAccessGroupAssignmentScheduleRequest,
) => getPimClient(account).identityGovernance.privilegedAccess.group.assignmentScheduleRequests.post(request)

/**
 * Deactivates a group assignment schedule request.
 *
 * @param account - The Azure MSAL account information for authentication.
 * @param requestId - The ID of the assignment schedule request to deactivate.
 * @returns A promise resolving to the updated request object.
 */
export const deactivateEntraGroupAssignmentScheduleRequest = async (role: EligibleRole) =>
	getPimClient(role.account).identityGovernance.privilegedAccess.group.assignmentScheduleRequests.post({
		action: 'selfDeactivate',
		principalId: role.schedule.principalId,
		groupId: role.schedule.roleDefinitionId,
		accessId: role.schedule.scope === 'owner' ? 'owner' : 'member',
		justification: 'User Requested Deactivation (PIMFast)',
	})

/**
 * Deactivates a role assignment schedule request.
 *
 * @param account - The Azure MSAL account information for authentication.
 * @param requestId - The ID of the assignment schedule request to deactivate.
 * @returns A promise resolving to the updated request object.
 */
export const deactivateEntraRoleAssignmentScheduleRequest = async (role: EligibleRole) =>
	getPimClient(role.account).roleManagement.directory.roleAssignmentScheduleRequests.post({
		action: 'selfDeactivate',
		principalId: role.schedule.principalId,
		roleDefinitionId: role.schedule.roleDefinitionId,
		directoryScopeId: role.schedule.scope,
	})

/**
 * Retrieves the current user's role assignment schedule instances from Microsoft Graph PIM.
 * These represent active role assignments.
 *
 * @param account - The Azure MSAL account information for authentication.
 * @returns A promise that resolves to an array of UnifiedRoleAssignmentScheduleInstance objects.
 * @throws Will throw an error if fetching fails.
 */
export async function getMyEntraRoleAssignmentScheduleInstances(
	account: AccountInfo,
): Promise<UnifiedRoleAssignmentScheduleInstanceExpanded[]> {
	try {
		const client = await getPimClient(account)

		const request =
			client.roleManagement.directory.roleAssignmentScheduleInstances.filterByCurrentUserWithOn('principal')
		const response = await request.get({
			queryParameters: {
				expand: ['roleDefinition', 'principal'],
			},
		})

		return (response?.value as UnifiedRoleAssignmentScheduleInstanceExpanded[]) ?? []
	} catch (error) {
		console.error('Error fetching Entra role assignment schedule instances:', error)
		throw error
	}
}

/**
 * Retrieves the current user's group assignment schedule instances from Microsoft Graph PIM.
 * These represent active group role assignments.
 *
 * @param account - The Azure MSAL account information for authentication.
 * @returns A promise that resolves to an array of PrivilegedAccessGroupAssignmentScheduleInstance objects.
 * @throws Will throw an error if fetching fails.
 */
export async function getMyEntraGroupAssignmentScheduleInstances(
	account: AccountInfo,
): Promise<PrivilegedAccessGroupAssignmentScheduleInstanceExpanded[]> {
	try {
		const client = await getPimClient(account)

		const request =
			client.identityGovernance.privilegedAccess.group.assignmentScheduleInstances.filterByCurrentUserWithOn(
				'principal',
			)
		const response = await request.get({
			queryParameters: {
				expand: ['group', 'principal'],
			},
		})

		return (response?.value as PrivilegedAccessGroupAssignmentScheduleInstanceExpanded[]) ?? []
	} catch (error) {
		console.error('Error fetching group assignment schedule instances:', error)
		throw error
	}
}