/**
 * RoleActivationForm Component
 *
 * A reusable React component for creating Azure PIM role activation requests.
 * Built with Mantine UI components and @mantine/form for form state management.
 *
 * Features:
 * - Form validation using @mantine/form
 * - Support for justification, ticket number, start time, and duration
 * - Configurable policy requirements (justification/ticket required, max duration)
 * - TypeScript support with proper Azure SDK types
 * - Consistent with existing project conventions (single quotes, semicolons, etc.)
 *
 * Usage:
 * ```tsx
 * import { RoleActivationForm } from './RoleActivationForm';
 * import { EligibleRole } from './RoleTable';
 *
 * <RoleActivationForm
 *   eligibleRole={myEligibleRole}
 *   onSuccess={(request) => console.log('Success:', request)}
 *   onError={(error) => console.error('Error:', error)}
 *   onCancel={() => console.log('Cancelled')}
 *   showCancelButton={true}
 *   policyRequirements={{
 *     requiresJustification: true,
 *     requiresTicket: false,
 *     maxDuration: 'PT8H'
 *   }}
 * />
 * ```
 *
 * @see RoleActivationExample.tsx for complete usage examples
 */

import { activateEligibleRole, EligibleRoleActivationRequest } from '@/api/pim'
import { throwError } from '@/api/util'
import { EligibleRole } from '@/model/EligibleRole'
import { RoleAssignmentScheduleRequest } from '@azure/arm-authorization'
import { Button, Group, Modal, Slider, Stack, Text, Textarea, TextInput, Title } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { useDisclosure } from '@mantine/hooks'
import { IconCheck } from '@tabler/icons-react'
import { useMutation } from '@tanstack/react-query'
import dayjs from 'dayjs'
import durationPlugin from 'dayjs/plugin/duration'
import { humanizer } from 'humanize-duration'
import { useState } from 'react'

dayjs.extend(durationPlugin)

interface RoleActivationFormProps {
	/** The eligible role to create an activation request for */
	eligibleRole: EligibleRole
	/** Called when the form is successfully submitted */
	onSuccess?: (request: RoleAssignmentScheduleRequest) => void
	/** Called when the form submission fails */
	onError?: (error: Error) => void
	/** Called when the form is cancelled */
	onCancel?: () => void
	/** Whether to show the cancel button */
	showCancelButton?: boolean
	/** Custom policy requirements, if not provided defaults will be used */
	policyRequirements?: PolicyRequirements
}

interface FormValues {
	justification: string
	ticketNumber: string
	startTime: Date
	durationMinutes: number
}

interface PolicyRequirements {
	requiresJustification: boolean
	requiresTicket: boolean
	maxDuration: string // ISO 8601 duration format (e.g., 'PT8H')
}

export type { PolicyRequirements }

/**
 * A form component for creating role activation requests.
 * Uses @mantine/form for form state management and validation.
 */
export function RoleActivationForm({
	eligibleRole,
	policyRequirements: customPolicyRequirements,
	onSuccess: onActivateRoleSuccess,
	onError,
}: RoleActivationFormProps) {
	const [errorModalOpened, { open: openErrorModal, close: closeErrorModal }] = useDisclosure(false)
	const [errorMessage, setErrorMessage] = useState('')

	const form = useForm<FormValues>({
		mode: 'uncontrolled',
		initialValues: {
			justification: '',
			ticketNumber: '',
			startTime: new Date(),
			durationMinutes: 60, // Default 1 hour
		},
		validate: {
			justification: value => {
				// We'll validate this based on policy requirements
				// For now, assume it's required
				return value.trim().length === 0 ? 'Justification is required' : null
			},
		},
	})

	// Use custom policy requirements if provided, otherwise use defaults
	const policyRequirements: PolicyRequirements = customPolicyRequirements ?? {
		requiresJustification: true,
		requiresTicket: false,
		maxDuration: 'PT8H', // 8 hours
	}

	const maxDurationMinutes = dayjs.duration(policyRequirements.maxDuration).asMinutes()

	const activationMutation = useMutation({
		mutationKey: ['activateRole', eligibleRole.schedule.id],
		mutationFn: async (activationRequest: EligibleRoleActivationRequest) =>
			await activateEligibleRole(eligibleRole.account, activationRequest),
		onSuccess: result => {
			console.debug(`Submitted Activation Request ${result.id} for ${result.linkedRoleEligibilityScheduleId}`)
			if (onActivateRoleSuccess) onActivateRoleSuccess(result)
		},
		onError: error => {
			const message = error instanceof Error ? error.message : 'Unknown error occurred'
			setErrorMessage(message)
			openErrorModal()

			if (onError) onError(error as Error)
		},
	})

	const handleSubmit = async (values: FormValues) => {
		const activationRequest = newActivationRequest(values)
		activationMutation.mutate(activationRequest)
	}

	function newActivationRequest(
		{ durationMinutes, justification, startTime, ticketNumber }: FormValues,
		{ account, schedule }: EligibleRole = eligibleRole,
	): EligibleRoleActivationRequest {
		// For ARM-based schedules, we need the original schedule
		if (schedule.sourceType !== 'arm' || !schedule.originalSchedule) {
			throw new Error('Only ARM-based role activation is currently supported')
		}

		const armSchedule = schedule.originalSchedule as any // ARM schedule type

		return {
			requestType: 'SelfActivate',
			scope: schedule.scope ?? throwError('Scope is required'),
			id: crypto.randomUUID(),
			justification,
			ticketInfo: ticketNumber ? { ticketNumber } : undefined,
			linkedRoleEligibilityScheduleId:
				armSchedule.roleEligibilityScheduleId ??
				throwError(
					'This is not a eligible role (missing linkedEligibileRoleId). This is a bug and you should report it.',
				),
			principalId: account.localAccountId,
			roleDefinitionId: schedule.roleDefinitionId ?? throwError('Role definition ID is required'),
			scheduleInfo: {
				startDateTime: startTime || new Date(),
				expiration: {
					type: 'AfterDuration',
					duration: dayjs.duration(durationMinutes, 'minutes').toISOString(),
				},
			},
		}
	}

	return (
		<>
			<form onSubmit={form.onSubmit(handleSubmit)}>
				<Stack>
					{/* Role Information */}
					<Group
						gap="xs"
						justify="space-evenly"
					>
						<Text
							size="sm"
							c="dimmed"
						>
							Role: {eligibleRole.schedule.roleDefinitionDisplayName ?? 'Unknown Role'}
						</Text>
						<Text
							size="sm"
							c="dimmed"
						>
							Scope: {eligibleRole.schedule.scopeDisplayName ?? eligibleRole.schedule.scope ?? 'Unknown Scope'}
						</Text>
					</Group>

					{/* Required Fields */}
					<Stack gap="md">
						<Textarea
							label="Justification"
							placeholder="Enter reason for role activation"
							required={policyRequirements.requiresJustification}
							minRows={3}
							key={form.key('justification')}
							{...form.getInputProps('justification')}
						/>

						<Stack gap="xs">
							<Text
								size="sm"
								fw={500}
							>
								Activation Duration
							</Text>
							<Slider
								color="blue"
								labelAlwaysOn
								min={5}
								step={5}
								max={maxDurationMinutes}
								mt="xl"
								ml="md"
								mr="md"
								key={form.key('durationMinutes')}
								{...form.getInputProps('durationMinutes')}
								label={value => humanizer({ round: true })(value * 60 * 1000)}
							/>
						</Stack>
					</Stack>

					{/* Optional Fields */}
					<Stack gap="md">
						<Title
							order={5}
							ta="center"
						>
							Optional Parameters
						</Title>

						<TextInput
							label={policyRequirements.requiresTicket ? 'Ticket Number' : 'Ticket Number (optional)'}
							placeholder={
								policyRequirements.requiresTicket
									? 'Enter ticket or case number'
									: 'Enter ticket or case number if applicable'
							}
							required={policyRequirements.requiresTicket}
							key={form.key('ticketNumber')}
							{...form.getInputProps('ticketNumber')}
						/>

						<DateTimePicker
							label="Custom Start Time (optional)"
							key={form.key('startTime')}
							{...form.getInputProps('startTime')}
						/>
					</Stack>

					{/* Action Buttons */}
					<Group
						justify="flex-end"
						mt="md"
					>
						<Button
							type="submit"
							loading={activationMutation.isPending}
							leftSection={<IconCheck size={16} />}
						>
							Request Activation
						</Button>
					</Group>
				</Stack>
			</form>

			<Modal
				opened={errorModalOpened}
				onClose={closeErrorModal}
				title="Role Activation Failed"
				centered
			>
				<Text>{errorMessage}</Text>
				<Group
					justify="flex-end"
					mt="md"
				>
					<Button onClick={closeErrorModal}>Close</Button>
				</Group>
			</Modal>
		</>
	)
}
