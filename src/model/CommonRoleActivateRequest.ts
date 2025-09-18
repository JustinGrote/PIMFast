// Import necessary models
import {
	PrivilegedAccessGroupAssignmentScheduleRequest,
	UnifiedRoleAssignmentScheduleRequest
} from '@/api/generated/msgraph/models';
import { KnownType, RoleAssignmentScheduleRequest } from '@azure/arm-authorization';
import dayjs from 'dayjs';
import { match, P } from 'ts-pattern';

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
	/** End time for the assignment. Undefined means no expiration */
	endDateTime?: Date
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
			type: 'AfterDateTime',
			endDateTime: common.endDateTime,
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
			type: 'afterDateTime',
			endDateTime: common.endDateTime,
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
			endDateTime: common.endDateTime,
		},
	},
	justification: common.justification,
})

/** Convert to the appropriate end date format */
function coalesceArmExpiration(arm: RoleAssignmentScheduleRequest): Date | undefined {
	return match(arm.scheduleInfo?.expiration?.type as KnownType)
		.with(KnownType.NoExpiration, () => undefined)
		.with(KnownType.AfterDateTime, () => arm.scheduleInfo?.expiration?.endDateTime)
		.with(KnownType.AfterDuration, () => {
			const start = arm.scheduleInfo?.startDateTime ?? new Date();
			const minutes = dayjs.duration(arm.scheduleInfo?.expiration?.duration || 'PT0M').asMinutes();
			return dayjs(start).add(minutes).toDate();
		})
		.exhaustive();
}

/**
 * Converts an Azure ARM RoleAssignmentScheduleRequest to CommonRoleActivateRequest
 */
export const fromArmRoleAssignmentScheduleRequest = (arm: RoleAssignmentScheduleRequest): CommonRoleActivateRequest => ({
		id: arm.id || '',
		scope: arm.scope || '',
		roleDefinitionId: arm.roleDefinitionId || '',
		principalId: arm.principalId || '',
		justification: arm.justification,
		ticketInfo: arm.ticketInfo,
		startDateTime: arm.scheduleInfo?.startDateTime,
		endDateTime: coalesceArmExpiration(arm),
		requestType: arm.requestType || 'SelfActivate',
		linkedRoleEligibilityScheduleId: arm.linkedRoleEligibilityScheduleId,
		sourceType: 'arm',
	})


/** Coalesce expiration for Entra/Graph and Group role schedule requests */
function coalesceGraphExpiration(
	request: UnifiedRoleAssignmentScheduleRequest
): Date | undefined {
	const scheduleInfo = request.scheduleInfo;
	const expiration = scheduleInfo?.expiration;
	return match(expiration?.type)
		.with(P.nullish, () => undefined)
		.with('notSpecified', () => undefined)
		.with('noExpiration', () => undefined)
		.with('afterDateTime', () => expiration?.endDateTime ?? undefined)
		.with('afterDuration', () => {
			const start = scheduleInfo?.startDateTime ?? new Date()
			const graphDuration = scheduleInfo?.expiration?.duration
			if (!graphDuration) return undefined
			const duration = dayjs.duration(graphDuration.toString())
			return dayjs(start).add(duration).toDate();
		})
		.exhaustive();
}

/**
 * Converts a Microsoft Graph UnifiedRoleAssignmentScheduleRequest to CommonRoleActivateRequest
 */
export const fromEntraRoleAssignmentScheduleRequest = (
	graph: UnifiedRoleAssignmentScheduleRequest,
): CommonRoleActivateRequest => {
	return {
		id: graph.id || '',
		scope: graph.directoryScopeId || '/',
		roleDefinitionId: graph.roleDefinitionId || '',
		principalId: graph.principalId || '',
		justification: graph.justification || undefined,
		ticketInfo: graph.ticketInfo ? { ticketNumber: graph.ticketInfo.ticketNumber || undefined } : undefined,
		startDateTime: graph.scheduleInfo?.startDateTime ?? undefined,
		endDateTime: coalesceGraphExpiration(graph),
		requestType: graph.action || 'selfActivate',
		sourceType: 'graph',
	}
}

function coalesceGroupExpiration(
	scheduleInfo: PrivilegedAccessGroupAssignmentScheduleRequest['scheduleInfo']
): Date | undefined {
	const expiration = scheduleInfo?.expiration;
	return match(expiration?.type)
		.with(P.nullish, () => undefined)
		.with('notSpecified', () => undefined)
		.with('noExpiration', () => undefined)
		.with('afterDateTime', () => expiration?.endDateTime ?? undefined)
		.with('afterDuration', () => {
			const start = scheduleInfo?.startDateTime ?? new Date();
			if (!expiration?.duration) return undefined;
			const endDuration = dayjs.duration(expiration.duration.toString());
			return dayjs(start).add(endDuration).toDate();
		})
		.exhaustive();
}

/**
 * Converts a Microsoft Graph PrivilegedAccessGroupAssignmentScheduleRequest to CommonRoleActivateRequest
 */
export const fromGroupRoleAssignmentScheduleRequest = (
	group: PrivilegedAccessGroupAssignmentScheduleRequest,
): CommonRoleActivateRequest => ({
	id: group.id || '',
	scope: group.groupId || '',
	roleDefinitionId: group.accessId || 'member',
	principalId: group.principalId || '',
	justification: group.justification || undefined,
	ticketInfo: group.ticketInfo ? { ticketNumber: group.ticketInfo.ticketNumber || undefined } : undefined,
	startDateTime: group.scheduleInfo?.startDateTime ?? undefined,
	endDateTime: coalesceGroupExpiration(group.scheduleInfo),
	requestType: group.action || 'selfActivate',
	sourceType: 'group',
})
