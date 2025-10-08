import {
	DirectoryObject,
	Group,
	PrivilegedAccessGroupAssignmentSchedule,
	UnifiedRoleAssignmentSchedule,
} from '@/api/generated/msgraph/models'
import { throwError } from '@/api/util'
import { RoleAssignmentSchedule } from '@azure/arm-authorization'

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
export interface PrivilegedAccessGroupAssignmentScheduleExpanded extends PrivilegedAccessGroupAssignmentSchedule {
	group?: Group & {
		displayName?: string
		description?: string
	}
	principal?: DirectoryObject & {
		displayName?: string
	}
}

/**
 * Common interface for role assignment schedules that abstracts the differences
 * between Azure ARM and Microsoft Graph API role assignment schedule types.
 * This allows unified handling of eligible role schedules across different PIM APIs.
 */
export interface CommonRoleAssignmentSchedule {
	/** Unique identifier for the role schedule */
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
	/** Start date of the eligibility */
	startDateTime?: Date
	/** End date of the eligibility */
	endDateTime?: Date
	/** Original schedule for activation purposes */
	originalSchedule:
		| RoleAssignmentSchedule
		| UnifiedRoleAssignmentScheduleExpanded
		| PrivilegedAccessGroupAssignmentScheduleExpanded
	/** Source API type for debugging and specific operations */
	sourceType: 'arm' | 'graph' | 'group'
}

/**
 * Converts an Azure ARM RoleAssignmentSchedule to the common interface.
 */
export function fromArmAssignmentSchedule(schedule: RoleAssignmentSchedule): CommonRoleAssignmentSchedule {
	return {
		id: schedule.id ?? '',
		scope: schedule.scope ?? '',
		roleDefinitionId: schedule.roleDefinitionId ?? '',
		roleDefinitionDisplayName: schedule.expandedProperties?.roleDefinition?.displayName,
		scopeDisplayName: schedule.expandedProperties?.scope?.displayName,
		scopeType: schedule.expandedProperties?.scope?.type,
		principalId: schedule.principalId ?? '',
		principalDisplayName: schedule.expandedProperties?.principal?.displayName,
		startDateTime: schedule.startDateTime ? new Date(schedule.startDateTime) : undefined,
		endDateTime: schedule.endDateTime ? new Date(schedule.endDateTime) : undefined,
		originalSchedule: schedule,
		sourceType: 'arm',
	}
}

/**
 * Converts a Microsoft Graph UnifiedRoleAssignmentScheduleExpanded to the common interface.
 */
export function fromGraphAssignmentSchedule(
	schedule: UnifiedRoleAssignmentScheduleExpanded
): CommonRoleAssignmentSchedule {
	return {
		id: schedule.id ?? throwError('Missing id on Graph assignment schedule, this should not happen.'),
		scope: schedule.directoryScopeId ?? '/',
		roleDefinitionId: schedule.roleDefinitionId ?? '',
		roleDefinitionDisplayName: schedule.roleDefinition?.displayName,
		scopeDisplayName: schedule.directoryScopeId === '/' ? 'Directory' : schedule.directoryScopeId ?? undefined,
		scopeType: schedule.directoryScopeId === '/' ? 'directory' : undefined,
		principalId: schedule.principalId ?? '',
		principalDisplayName: schedule.principal?.displayName,
		startDateTime: schedule.scheduleInfo?.startDateTime ? new Date(schedule.scheduleInfo.startDateTime) : undefined,
		endDateTime: schedule.scheduleInfo?.expiration?.endDateTime
			? new Date(schedule.scheduleInfo.expiration.endDateTime)
			: undefined,
		originalSchedule: schedule,
		sourceType: 'graph',
	}
}

/**
 * Converts a Microsoft Graph PrivilegedAccessGroupAssignmentScheduleExpanded to the common interface.
 */
export function fromGroupAssignmentSchedule(
	schedule: PrivilegedAccessGroupAssignmentScheduleExpanded
): CommonRoleAssignmentSchedule {
	const roleDisplayName = schedule.accessId === 'owner' ? 'Owner' : 'Member'
	const groupDisplayName = schedule.group?.displayName ?? 'Unknown Group'

	return {
		id: schedule.id ?? throwError('Missing id on Group assignment schedule, this should not happen.'),
		scope: schedule.groupId ?? '',
		roleDefinitionId: schedule.accessId ?? '',
		roleDefinitionDisplayName: `${roleDisplayName} of ${groupDisplayName}`,
		scopeDisplayName: groupDisplayName,
		scopeType: 'group',
		principalId: schedule.principalId ?? '',
		principalDisplayName: schedule.principal?.displayName,
		startDateTime: schedule.scheduleInfo?.startDateTime ? new Date(schedule.scheduleInfo.startDateTime) : undefined,
		endDateTime: schedule.scheduleInfo?.expiration?.endDateTime
			? new Date(schedule.scheduleInfo.expiration.endDateTime)
			: undefined,
		originalSchedule: schedule,
		sourceType: 'group',
	}
}
