import {
	DirectoryObject,
	Group,
	PrivilegedAccessGroupAssignmentSchedule,
	UnifiedRoleAssignmentSchedule,
} from '@/api/generated/msgraph/models';
import { RoleAssignmentSchedule } from '@azure/arm-authorization';

/**
 * Expanded interface for UnifiedRoleAssignmentSchedule with populated roleDefinition and principal
 */
export interface UnifiedRoleAssignmentScheduleExpanded extends UnifiedRoleAssignmentSchedule {
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
 * Expanded interface for PrivilegedAccessGroupAssignmentSchedule with populated group and principal
 */
export interface PrivilegedAccessGroupAssignmentScheduleExpanded
	extends PrivilegedAccessGroupAssignmentSchedule {
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
		| RoleAssignmentSchedule
		| UnifiedRoleAssignmentScheduleExpanded
		| PrivilegedAccessGroupAssignmentScheduleExpanded
	/** Source API type for debugging and specific operations */
	sourceType: 'arm' | 'graph' | 'group'
}

/**
 * Converts an Azure ARM RoleAssignmentSchedule to the common interface.
 */
export function fromArmAssignment(assignment: RoleAssignmentSchedule): CommonRoleAssignmentScheduleInstance {
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
		linkedRoleEligibilityScheduleInstanceId: assignment.linkedRoleEligibilityScheduleId,
		originalAssignment: assignment,
		sourceType: 'arm',
	}
}

/**
 * Converts a Microsoft Graph UnifiedRoleAssignmentScheduleExpanded to the common interface.
 */
export function fromGraphAssignment(
	assignment: UnifiedRoleAssignmentScheduleExpanded,
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
		startDateTime: assignment.scheduleInfo?.startDateTime ? new Date(assignment.scheduleInfo.startDateTime) : undefined,
		endDateTime: assignment.scheduleInfo?.expiration?.endDateTime ? new Date(assignment.scheduleInfo.expiration.endDateTime) : undefined,
		status: assignment.assignmentType ?? undefined, // Graph uses assignmentType instead of status
		originalAssignment: assignment,
		sourceType: 'graph',
	}
}

/**
 * Converts a Microsoft Graph PrivilegedAccessGroupAssignmentScheduleExpanded to the common interface.
 */
export function fromGroupAssignment(
	assignment: PrivilegedAccessGroupAssignmentScheduleExpanded,
): CommonRoleAssignmentScheduleInstance {
	// Access ID determines the role type (owner or member)
	const roleDisplayName = assignment.accessId === 'owner' ? 'Owner' : 'Member'
	const groupDisplayName = assignment.group?.displayName ?? 'Unknown Group'

	return {
		id: assignment.id ?? '',
		scope: assignment.accessId ?? '',
		roleDefinitionId: assignment.group?.id ?? '',
		roleDefinitionDisplayName: `${roleDisplayName} of ${groupDisplayName}`,
		scopeDisplayName: groupDisplayName,
		scopeType: 'group',
		principalId: assignment.principalId ?? '',
		principalDisplayName: assignment.principal?.displayName,
		startDateTime: assignment.scheduleInfo?.startDateTime ? new Date(assignment.scheduleInfo.startDateTime) : undefined,
		endDateTime: assignment.scheduleInfo?.expiration?.endDateTime ? new Date(assignment.scheduleInfo.expiration.endDateTime) : undefined,
		status: assignment.assignmentType ?? undefined, // Group uses assignmentType instead of status
		originalAssignment: assignment,
		sourceType: 'group',
	}
}
