// Import necessary models
import {
	PrivilegedAccessGroupAssignmentScheduleRequest,
	UnifiedRoleAssignmentScheduleRequest,
} from '@/api/generated/msgraph/models'
import { RoleAssignmentScheduleRequest } from '@azure/arm-authorization'
import { Duration } from '@microsoft/kiota-abstractions'
import dayjs from 'dayjs'

/**
 * Common interface for role assignment schedule requests that abstracts the differences
 * between Azure ARM, Microsoft Graph API, and PIM for Groups assignment schedule request types.
 * This enables unified handling and conversion between types.
 */
export interface CommonRoleActivateRequest {
	/** Unique identifier for the request */
	id: string
	/** Scope/resource where the role applies (ARM: scope, Graph: directoryScopeId, Group: groupId) */
	scope: string
	/** Role definition ID or accessId (ARM/Graph: roleDefinitionId, Group: accessId) */
	roleDefinitionId: string
	/** Principal (user) ID */
	principalId: string
	/** Justification for the request */
	justification?: string
	/** Ticket info for the request */
	ticketInfo?: { ticketNumber?: string }
	/** Start time for the assignment */
	startDateTime?: Date
	/** Length of assignment, in minutes */
	duration: number
	/** Type of request (e.g., 'SelfActivate', 'AdminAssign', etc.) */
	requestType: string
	/** Linked eligibility schedule ID (ARM only) */
	linkedRoleEligibilityScheduleId?: string
	/** Source API type for debugging and conversion */
	sourceType: 'arm' | 'graph' | 'group'
}

/**
 * Converts a CommonRoleAssignmentScheduleRequest to an Azure ARM RoleAssignmentScheduleRequest
 */
export const toArmRoleAssignmentScheduleRequest = (
	common: CommonRoleActivateRequest,
): RoleAssignmentScheduleRequest => ({
	id: common.id,
	scope: common.scope,
	principalId: common.principalId,
	roleDefinitionId: common.roleDefinitionId,
	justification: common.justification,
	ticketInfo: common.ticketInfo,
	requestType: common.requestType,
	linkedRoleEligibilityScheduleId: common.linkedRoleEligibilityScheduleId,
	scheduleInfo: {
		startDateTime: common.startDateTime,
		expiration: {
			type: 'AfterDuration',
			duration: dayjs.duration(common.duration, 'minutes').toISOString(),
		},
	},
})

/**
 * Converts a CommonRoleAssignmentScheduleRequest to a Microsoft Graph UnifiedRoleAssignmentScheduleRequest
 */
export const toEntraRoleAssignmentScheduleRequest = (
	common: CommonRoleActivateRequest,
): UnifiedRoleAssignmentScheduleRequest => ({
	action: 'selfActivate',
	principalId: common.principalId,
	roleDefinitionId: common.roleDefinitionId,
	directoryScopeId: common.scope,
	justification: common.justification,
	ticketInfo: common.ticketInfo,
	scheduleInfo: {
		startDateTime: common.startDateTime,
		expiration: {
			duration: new Duration({
				years: 0,
				minutes: common.duration,
				months: 0,
				weeks: 0,
				days: 0,
				hours: 0,
				seconds: 0,
				negative: false,
			}),
			type: 'afterDuration',
		},
	},
	// assignmentType: common.requestType, // Not a valid property
	// ...other Graph-specific fields as needed
})

/**
 * Converts a CommonRoleAssignmentScheduleRequest to a Microsoft Graph PrivilegedAccessGroupAssignmentScheduleRequest
 */
export const toGroupRoleAssignmentScheduleRequest = (
	common: CommonRoleActivateRequest,
): PrivilegedAccessGroupAssignmentScheduleRequest => ({
	accessId: 'member', // Cast to satisfy type
	principalId: common.principalId,
	groupId: common.scope,
	action: 'selfActivate',
	scheduleInfo: {
		startDateTime: common.startDateTime,
		expiration: {
			type: 'afterDateTime',
			endDateTime: dayjs(common.startDateTime).add(common.duration, 'minutes').toDate(),
		},
	},
	justification: common.justification,
})

/**
 * Converts an Azure ARM RoleAssignmentScheduleRequest to CommonRoleActivateRequest
 */
export const fromArmRoleAssignmentScheduleRequest = (arm: RoleAssignmentScheduleRequest): CommonRoleActivateRequest => {
	// Extract duration from ISO 8601 duration string
	const durationMinutes = arm.scheduleInfo?.expiration?.duration
		? dayjs.duration(arm.scheduleInfo.expiration.duration).asMinutes()
		: 480 // Default to 8 hours if not specified

	return {
		id: arm.id || '',
		scope: arm.scope || '',
		roleDefinitionId: arm.roleDefinitionId || '',
		principalId: arm.principalId || '',
		justification: arm.justification,
		ticketInfo: arm.ticketInfo,
		startDateTime: arm.scheduleInfo?.startDateTime,
		duration: durationMinutes,
		requestType: arm.requestType || 'SelfActivate',
		linkedRoleEligibilityScheduleId: arm.linkedRoleEligibilityScheduleId,
		sourceType: 'arm',
	}
}

/**
 * Converts a Microsoft Graph UnifiedRoleAssignmentScheduleRequest to CommonRoleActivateRequest
 */
export const fromEntraRoleAssignmentScheduleRequest = (
	graph: UnifiedRoleAssignmentScheduleRequest,
): CommonRoleActivateRequest => {
	// Extract duration from Duration object
	const durationMinutes = graph.scheduleInfo?.expiration?.duration?.minutes || 480 // Default to 8 hours

	return {
		id: graph.id || '',
		scope: graph.directoryScopeId || '/',
		roleDefinitionId: graph.roleDefinitionId || '',
		principalId: graph.principalId || '',
		justification: graph.justification || undefined,
		ticketInfo: graph.ticketInfo ? { ticketNumber: graph.ticketInfo.ticketNumber || undefined } : undefined,
		startDateTime: graph.scheduleInfo?.startDateTime || undefined,
		duration: durationMinutes,
		requestType: graph.action || 'selfActivate',
		sourceType: 'graph',
	}
}

/**
 * Converts a Microsoft Graph PrivilegedAccessGroupAssignmentScheduleRequest to CommonRoleActivateRequest
 */
export const fromGroupRoleAssignmentScheduleRequest = (
	group: PrivilegedAccessGroupAssignmentScheduleRequest,
): CommonRoleActivateRequest => {
	// Calculate duration from start and end times
	let durationMinutes = 480 // Default to 8 hours

	if (group.scheduleInfo?.startDateTime && group.scheduleInfo?.expiration?.endDateTime) {
		durationMinutes = dayjs(group.scheduleInfo.expiration.endDateTime).diff(
			dayjs(group.scheduleInfo.startDateTime),
			'minutes',
		)
	}

	return {
		id: group.id || '',
		scope: group.groupId || '',
		roleDefinitionId: group.accessId || 'member',
		principalId: group.principalId || '',
		justification: group.justification || undefined,
		ticketInfo: group.ticketInfo ? { ticketNumber: group.ticketInfo.ticketNumber || undefined } : undefined,
		startDateTime: group.scheduleInfo?.startDateTime || undefined,
		duration: durationMinutes,
		requestType: group.action || 'selfActivate',
		sourceType: 'group',
	}
}
