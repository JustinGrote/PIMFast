import { activateEligibleRole } from '@/api/pim'
import { throwError } from '@/api/util'
import { CommonRoleActivateRequest } from '@/model/CommonRoleActivateRequest'
import { CommonRoleSchedule } from '@/model/CommonRoleSchedule'
import { getCommonRoleScheduleAccount } from '@/model/EligibleRole'
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
	/** The schedule to create an activation request for */
	schedule: CommonRoleSchedule
	/** Called when the form is successfully submitted */
	onSuccess?: (request: CommonRoleActivateRequest) => void
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

/**
 * A form component for creating role activation requests.
 * Uses @mantine/form for form state management and validation.
 */
export function RoleActivationForm({
	schedule,
	policyRequirements: customPolicyRequirements,
	onSuccess: onActivateRoleSuccess,
	onError,
}: RoleActivationFormProps) {
	const [errorModalOpened, { open: openErrorModal, close: closeErrorModal }] = useDisclosure(false)
	const [errorMessage, setErrorMessage] = useState('')
	const account = getCommonRoleScheduleAccount(schedule)

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
		mutationKey: ['activateRole', schedule.id],
		mutationFn: async (activationRequest: CommonRoleActivateRequest) =>
			await activateEligibleRole(
				account ?? throwError('Account mapping missing for activation mutation'),
				activationRequest
			),
		onSuccess: result => {
			console.debug(`Submitted Activation Request ${result.id} for role ${result.roleDefinitionId}`)
			if (onActivateRoleSuccess) onActivateRoleSuccess(result)
		},
		onError: error => {
			console.error('Error activating role:', error)
			// FIXME: Use Type guards
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			if ((error as any).errorEscaped?.code && (error as any).errorEscaped?.message) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const { code, message } = (error as any).errorEscaped
				setErrorMessage(`Code: ${code}\n Message: ${message}`)
			} else {
				const message = error instanceof Error ? error.message : JSON.stringify(error)
				setErrorMessage(message)
			}
			openErrorModal()

			if (onError) onError(error as Error)
		},
	})

	const handleSubmit = async (values: FormValues) => {
		const activationRequest = newActivationRequest(values)
		activationMutation.mutate(activationRequest)
	}

	function newActivationRequest({
		durationMinutes,
		justification,
		startTime,
		ticketNumber,
	}: FormValues): CommonRoleActivateRequest {
		if (!account) {
			throwError('Account context missing for activation request')
		}

		return {
			requestType: 'SelfActivate',
			sourceType: schedule.sourceType,
			scope: schedule.scope ?? throwError('Scope is required'),
			id: crypto.randomUUID(),
			justification,
			ticketInfo: ticketNumber ? { ticketNumber } : undefined,
			linkedRoleEligibilityScheduleId: schedule.id,
			roleDefinitionId: schedule.roleDefinitionId,
			startDateTime: startTime || new Date(),
			endDateTime: dayjs(startTime || new Date())
				.add(durationMinutes + 0.1, 'minutes')
				.toDate(),
			//INFO: The principal should always the be user making the request for SelfActivate
			principalId: account.localAccountId,
		}
	}

	if (!account) {
		return <Text c="red">Unable to resolve account for the selected role. Please refresh and try again.</Text>
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
							Role: {schedule.roleDefinitionDisplayName ?? 'Unknown Role'}
						</Text>
						<Text
							size="sm"
							c="dimmed"
						>
							Scope: {schedule.scopeDisplayName ?? schedule.scope ?? 'Unknown Scope'}
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
