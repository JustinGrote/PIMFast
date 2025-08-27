import { UnifiedRoleEligibilityScheduleInstanceExpanded } from '@/api/pimGraph'
import { RoleEligibilityScheduleInstance } from '@azure/arm-authorization'

/**
 * Common interface for role schedule instances that abstracts the differences
 * between Azure ARM and Microsoft Graph API role schedule types.
 * This allows the RoleTable to display both types uniformly.
 *
 * This enables displaying:
 * - Azure Resource roles (ARM API) - Can be activated/deactivated
 * - Entra ID directory roles (Graph API) - Display only for now
 */
export interface CommonRoleSchedule {
	/** Unique identifier for the role schedule instance */
	id: string
	/** Scope/resource where the role applies (ARM: scope, Graph: directoryScopeId) */
	scope: string
	/** Role definition ID */
	roleDefinitionId: string
	/** Role definition display name */
	roleDefinitionDisplayName: string
	/** Scope/resource display name */
	scopeDisplayName: string
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
	/** Original schedule instance for activation purposes */
	originalSchedule: RoleEligibilityScheduleInstance | UnifiedRoleEligibilityScheduleInstanceExpanded
	/** Source API type for debugging and specific operations */
	sourceType: 'arm' | 'graph'
}

/**
 * Converts an Azure ARM RoleEligibilityScheduleInstance to the common interface.
 */
export function armScheduleToCommon(schedule: RoleEligibilityScheduleInstance): CommonRoleSchedule {
	return {
		id: schedule.id ?? '',
		scope: schedule.scope ?? '',
		roleDefinitionId: schedule.roleDefinitionId ?? '',
		roleDefinitionDisplayName: schedule.expandedProperties?.roleDefinition?.displayName ?? 'Unknown Role',
		scopeDisplayName: schedule.expandedProperties?.scope?.displayName ?? 'Unknown Scope',
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
 * Converts a Microsoft Graph UnifiedRoleEligibilityScheduleInstanceExpanded to the common interface.
 */
export function graphScheduleToCommon(schedule: UnifiedRoleEligibilityScheduleInstanceExpanded): CommonRoleSchedule {
	return {
		id: schedule.id ?? '',
		scope: schedule.directoryScopeId ?? '/',
		roleDefinitionId: schedule.roleDefinitionId ?? '',
		roleDefinitionDisplayName: schedule.roleDefinition?.displayName ?? 'Unknown Role',
		scopeDisplayName: schedule.directoryScopeId === '/' ? 'Directory' : (schedule.directoryScopeId ?? 'Unknown Scope'),
		scopeType: schedule.directoryScopeId === '/' ? 'directory' : undefined,
		principalId: schedule.principalId ?? '',
		principalDisplayName: schedule.principal?.displayName,
		startDateTime: schedule.startDateTime ? new Date(schedule.startDateTime) : undefined,
		endDateTime: schedule.endDateTime ? new Date(schedule.endDateTime) : undefined,
		originalSchedule: schedule,
		sourceType: 'graph',
	}
}
