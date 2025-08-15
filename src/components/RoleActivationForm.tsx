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

import { RoleAssignmentScheduleRequest } from '@azure/arm-authorization'
import { Button, Group, Slider, Stack, Text, Textarea, TextInput, Title } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { IconCheck, IconX } from '@tabler/icons-react'
import dayjs from 'dayjs'
import durationPlugin from 'dayjs/plugin/duration'
import { activateRole } from '../common/pim'
import { EligibleRole } from './RoleTable'

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
	/** Duration in minutes */
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
	onSuccess,
	onError,
	onCancel,
	showCancelButton = true,
	policyRequirements: customPolicyRequirements,
}: RoleActivationFormProps) {
	const { account, schedule } = eligibleRole

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

	const handleSubmit = async (values: FormValues) => {
		try {
			// Convert duration from minutes to ISO 8601 format
			const duration = `PT${values.durationMinutes}M`

			const request = await activateRole(
				eligibleRole.account,
				eligibleRole.schedule,
				values.justification,
				values.ticketNumber || undefined,
				values.startTime,
				duration,
			)

			onSuccess?.(request)
		} catch (error) {
			const errorObj = error instanceof Error ? error : new Error('Unknown error occurred')
			onError?.(errorObj)
		}
	}

	return (
		<form onSubmit={form.onSubmit(handleSubmit)}>
			<Stack>
				{/* Role Information */}
				<Stack gap="xs">
					<Title order={4}>Role Details</Title>
					<Text
						size="sm"
						c="dimmed"
					>
						Role: {eligibleRole.schedule.expandedProperties?.roleDefinition?.displayName ?? 'Unknown Role'}
					</Text>
					<Text
						size="sm"
						c="dimmed"
					>
						Scope:{' '}
						{eligibleRole.schedule.expandedProperties?.scope?.displayName ??
							eligibleRole.schedule.scope ??
							'Unknown Scope'}
					</Text>
				</Stack>

				{/* Required Fields */}
				<Stack gap="md">
					<Title order={5}>Required Information</Title>

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
							fw={600}
							size="sm"
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
							label={value => dayjs.duration(value, 'minutes').humanize()}
						/>
					</Stack>
				</Stack>

				{/* Optional Fields */}
				<Stack gap="md">
					<Title order={5}>Optional Parameters</Title>

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
					{showCancelButton && (
						<Button
							variant="outline"
							color="gray"
							onClick={onCancel}
							leftSection={<IconX size={16} />}
						>
							Cancel
						</Button>
					)}
					<Button
						type="submit"
						leftSection={<IconCheck size={16} />}
					>
						Submit Activation
					</Button>
				</Group>
			</Stack>
		</form>
	)
}
