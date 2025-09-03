import {
	DirectoryObject,
	Group,
	PrivilegedAccessGroupAssignmentScheduleInstance,
	UnifiedRoleAssignmentScheduleInstance,
} from '@/api/generated/msgraph/models'
import { RoleAssignmentScheduleInstance } from '@azure/arm-authorization'

/**
 * Expanded interface for UnifiedRoleAssignmentScheduleInstance with populated roleDefinition and principal
 */
export interface UnifiedRoleAssignmentScheduleInstanceExpanded extends UnifiedRoleAssignmentScheduleInstance {
	roleDefinition?: {
		id?: string
		displayName?: string
	}
	principal?: {
		id?: string
		displayName?: string
		userPrincipalName?: string
	}
}

/**
 * Expanded interface for PrivilegedAccessGroupAssignmentScheduleInstance with populated group and principal
 */
export interface PrivilegedAccessGroupAssignmentScheduleInstanceExpanded
	extends PrivilegedAccessGroupAssignmentScheduleInstance {
	group?: Group & {
		displayName?: string
		description?: string
	}
	principal?: DirectoryObject & {
		displayName?: string
	}
}

/**
 * Common interface for role assignment schedule instances that abstracts the differences
 * between Azure ARM and Microsoft Graph API role assignment schedule types.
 * This allows unified handling of active role assignments across different PIM APIs.
 *
 * This enables displaying status for:
 * - Azure Resource roles (ARM API) - Active assignments
 * - Entra ID directory roles (Graph API) - Active assignments
 * - Group roles (Graph API PIM for Groups) - Active assignments
 */
export interface CommonRoleAssignmentScheduleInstance {
	/** Unique identifier for the role assignment schedule instance */
	id: string
	/** Scope/resource where the role applies (ARM: scope, Graph: directoryScopeId) */
	scope: string
	/** Role definition ID */
	roleDefinitionId: string
	/** Role definition display name */
	roleDefinitionDisplayName?: string
	/** Scope/resource display name */
	scopeDisplayName?: string
	/** Scope/resource type (e.g., 'subscription', 'resourcegroup', 'managementgroup') */
	scopeType?: string
	/** Principal (user) ID */
	principalId: string
	/** Principal display name */
	principalDisplayName?: string
	/** Start date of the assignment */
	startDateTime?: Date
	/** End date of the assignment */
	endDateTime?: Date
	/** Assignment status */
	status?: string
	/** Linked role eligibility schedule instance ID (ARM only) */
	linkedRoleEligibilityScheduleInstanceId?: string
	/** Original assignment schedule instance for specific operations */
	originalAssignment:
		| RoleAssignmentScheduleInstance
		| UnifiedRoleAssignmentScheduleInstanceExpanded
		| PrivilegedAccessGroupAssignmentScheduleInstanceExpanded
	/** Source API type for debugging and specific operations */
	sourceType: 'arm' | 'graph' | 'group'
}

/**
 * Converts an Azure ARM RoleAssignmentScheduleInstance to the common interface.
 */
export function fromArmAssignment(assignment: RoleAssignmentScheduleInstance): CommonRoleAssignmentScheduleInstance {
	return {
		id: assignment.id ?? '',
		scope: assignment.scope ?? '',
		roleDefinitionId: assignment.roleDefinitionId ?? '',
		roleDefinitionDisplayName: assignment.expandedProperties?.roleDefinition?.displayName,
		scopeDisplayName: assignment.expandedProperties?.scope?.displayName,
		scopeType: assignment.expandedProperties?.scope?.type,
		principalId: assignment.principalId ?? '',
		principalDisplayName: assignment.expandedProperties?.principal?.displayName,
		startDateTime: assignment.startDateTime ? new Date(assignment.startDateTime) : undefined,
		endDateTime: assignment.endDateTime ? new Date(assignment.endDateTime) : undefined,
		status: assignment.status,
		linkedRoleEligibilityScheduleInstanceId: assignment.linkedRoleEligibilityScheduleInstanceId,
		originalAssignment: assignment,
		sourceType: 'arm',
	}
}

/**
 * Converts a Microsoft Graph UnifiedRoleAssignmentScheduleInstanceExpanded to the common interface.
 */
export function fromGraphAssignment(
	assignment: UnifiedRoleAssignmentScheduleInstanceExpanded,
): CommonRoleAssignmentScheduleInstance {
	return {
		id: assignment.id ?? '',
		scope: assignment.directoryScopeId ?? '/',
		roleDefinitionId: assignment.roleDefinitionId ?? '',
		roleDefinitionDisplayName: assignment.roleDefinition?.displayName,
		scopeDisplayName: assignment.directoryScopeId === '/' ? 'Directory' : (assignment.directoryScopeId ?? undefined),
		scopeType: assignment.directoryScopeId === '/' ? 'directory' : undefined,
		principalId: assignment.principalId ?? '',
		principalDisplayName: assignment.principal?.displayName,
		startDateTime: assignment.startDateTime ? new Date(assignment.startDateTime) : undefined,
		endDateTime: assignment.endDateTime ? new Date(assignment.endDateTime) : undefined,
		status: assignment.assignmentType ?? undefined, // Graph uses assignmentType instead of status
		originalAssignment: assignment,
		sourceType: 'graph',
	}
}

/**
 * Converts a Microsoft Graph PrivilegedAccessGroupAssignmentScheduleInstanceExpanded to the common interface.
 */
export function fromGroupAssignment(
	assignment: PrivilegedAccessGroupAssignmentScheduleInstanceExpanded,
): CommonRoleAssignmentScheduleInstance {
	// Access ID determines the role type (owner or member)
	const roleDisplayName = assignment.accessId === 'owner' ? 'Owner' : 'Member'
	const groupDisplayName = assignment.group?.displayName ?? 'Unknown Group'

	return {
		id: assignment.id ?? '',
		scope: assignment.groupId ?? '',
		roleDefinitionId: assignment.accessId ?? '',
		roleDefinitionDisplayName: `${roleDisplayName} of ${groupDisplayName}`,
		scopeDisplayName: groupDisplayName,
		scopeType: 'group',
		principalId: assignment.principalId ?? '',
		principalDisplayName: assignment.principal?.displayName,
		startDateTime: assignment.startDateTime ? new Date(assignment.startDateTime) : undefined,
		endDateTime: assignment.endDateTime ? new Date(assignment.endDateTime) : undefined,
		status: assignment.assignmentType ?? undefined, // Group uses assignmentType instead of status
		originalAssignment: assignment,
		sourceType: 'group',
	}
}
