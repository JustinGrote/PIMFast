import { fetchTenantNameByResourceId } from '@/common/subscriptions'
import { RoleAssignmentScheduleRequest, RoleEligibilityScheduleInstance } from '@azure/arm-authorization'
import { AccountInfo } from '@azure/msal-browser'
import {
	ActionIcon,
	Button,
	Group,
	Loader,
	Modal,
	Notification,
	Paper,
	Stack,
	Text,
	Textarea,
	TextInput,
	Title,
} from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useMap } from '@mantine/hooks'
import { IconCheck, IconPlayerPlay, IconQuestionMark, IconRefresh, IconX } from '@tabler/icons-react'
import { ManagementGroups, ResourceGroups, Subscriptions } from '@threeveloper/azure-react-icons'
import { DataTable } from 'mantine-datatable'
import React, { useEffect, useState } from 'react'
import { match } from 'ts-pattern'
import { getAllAccounts } from '../common/auth'
import { activateRole, getPolicyRequirements, getRoleEligibilityScheduleInstances } from '../common/pim'
import './RoleTable.css'

interface RoleTableProps {
	onRefresh?: () => void
}

/** A role schedule instance and the account which it was fetched from. Needed to preserve context for activation so we know which user the role is valid for */
interface AccountRoleEligibilityScheduleInstance {
	account: AccountInfo
	schedule: RoleEligibilityScheduleInstance
	/** Set to a hyphenated string of account HomeAccountId and schedule Id. Has to be unique for row processing */
	id: string
}
/** All the information required to activate a PIM eligible role */
type EligibleRole = AccountRoleEligibilityScheduleInstance
type EligibleRoleId = EligibleRole['id']

const RoleTable: React.FC<RoleTableProps> = ({ onRefresh }) => {
	// Data State
	const [accounts, setAccounts] = useState<AccountInfo[]>([])
	/** Some eligible roles are in other tenants, so we want to display friendly names for these */
	const tenantNameMap = new Map<EligibleRoleId, string>()
	const [eligibleRoles, setEligibleRoles] = useState<EligibleRole[]>([])
	/** Tracks state for role activations and refreshes the UI accordingly */
	const activationMap = useMap<EligibleRoleId, RoleAssignmentScheduleRequest>([])

	// UI Hooks
	const [loadingRoles, setLoadingRoles] = useState(false)
	const [activationModalOpen, setActivationModalOpen] = useState(false)
	const [selectedEligibleRoles, setSelectedEligibleRoles] = useState<EligibleRole[]>([])
	const [justification, setJustification] = useState('')
	const [ticketNumber, setTicketNumber] = useState('')
	const [startTime, setStartTime] = useState<Date>(new Date())
	const [endTime, setEndTime] = useState<Date | null>(null)
	const [activating, _setActivating] = useState(false)
	const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
	const [policyRequirements, setPolicyRequirements] = useState({
		requiresJustification: true,
		requiresTicket: false,
		maxActivationDuration: 8,
	})

	const fetchEligibleRoles = async () => {
		setLoadingRoles(true)
		try {
			setAccounts(await getAllAccounts())
			const allEligibleRoles: EligibleRole[] = []
			for (const account of accounts) {
				for await (const schedule of getRoleEligibilityScheduleInstances(account)) {
					allEligibleRoles.push({
						account,
						schedule,
						id: `${account.homeAccountId}-${schedule.id}`,
					})
				}
			}
			setEligibleRoles(allEligibleRoles)
		} catch (error) {
			console.error('Error loading role schedules:', error)
		} finally {
			setLoadingRoles(false)
		}
	}

	useEffect(() => {
		fetchEligibleRoles()
	}, [onRefresh])

	useEffect(() => {
		const fetchTenantNames = async () => {
			if (!eligibleRoles.length) return

			for (const role of eligibleRoles) {
				// These don't change (except if a subscription moves tenants which is rare) so we can cache them for the lifetime of the session.
				if (tenantNameMap.has(role.id)) continue

				try {
					const { account, schedule } = role
					if (!schedule.scope) throw new Error('Missing schedule scope')

					const tenantName = (await fetchTenantNameByResourceId(account, schedule.scope)) || 'Unknown'
					tenantNameMap.set(role.id, tenantName)
				} catch {
					tenantNameMap.set(role.id, 'Unknown')
				}
			}
		}
		fetchTenantNames()
	}, [eligibleRoles])

	async function handleActivateClick(eligibleRole: EligibleRole, _index?: number) {
		setSelectedEligibleRoles([eligibleRole])
		setJustification('')
		setTicketNumber('')
		setStartTime(new Date())

		try {
			if (eligibleRole.account) {
				// Get policy requirements for this role
				const requirements = await getPolicyRequirements(eligibleRole.account, eligibleRole.schedule)
				setPolicyRequirements(requirements)

				// Calculate default end time based on policy max duration
				const defaultEndTime = new Date()
				defaultEndTime.setHours(defaultEndTime.getHours() + requirements.maxActivationDuration)
				setEndTime(defaultEndTime)
			}
		} catch (error) {
			console.error('Error getting policy requirements:', error)
			// Set default end time (8 hours from now)
			const defaultEndTime = new Date()
			defaultEndTime.setHours(defaultEndTime.getHours() + 8)
			setEndTime(defaultEndTime)
		}

		setActivationModalOpen(true)
	}

	async function handleModalActivateClick(eligibleRoles: EligibleRole[]) {
		if (eligibleRoles.length === 0) return
		if (eligibleRoles.length > 1) throw new Error('Multiple role activation is not yet supported')

		const { account, schedule, id } = eligibleRoles[0]
		if (!id) throw new Error('Missing eligible role ID')

		// This will trigger a refresh that sets the loading to true. We put in a dummy ID until we have a real one from the API.
		activationMap.set(id, { id: 'CREATING' })
		const requestEndTime = endTime === null ? undefined : endTime
		const activationRequest = await activateRole(
			account,
			schedule,
			justification,
			ticketNumber,
			startTime,
			requestEndTime,
		)

		// Update the activation map with the real request. This should trigger a UI refresh
		activationMap.set(id, activationRequest)
	}

	return (
		<>
			<Paper shadow="xs" p="md" mt="xl">
				<Stack>
					<Group justify="space-between" align="center">
						<Title order={2}>Eligible Roles</Title>
						<Button
							onClick={fetchEligibleRoles}
							disabled={loadingRoles}
							variant="subtle"
							size="compact-xs"
							styles={{ root: { height: '1.5rem', minHeight: 'unset', padding: '0 0.3rem' } }}
						>
							<IconRefresh size="0.9rem" />
						</Button>
					</Group>

					{loadingRoles ? (
						<Group justify="center" p="xl">
							<Loader size="md" />
							<Text>Loading role schedules...</Text>
						</Group>
					) : eligibleRoles.length > 0 ? (
						<DataTable
							className="roleTable"
							withTableBorder
							borderRadius="xs"
							withColumnBorders
							striped
							highlightOnHover
							pinLastColumn
							// TODO: Add multiple activation support
							// selectedRecords={selectedSchedules}
							// onSelectedRecordsChange={setSelectedSchedules}
							records={eligibleRoles}
							columns={[
								{
									accessor: 'roleDefinition',
									title: 'Role',
									render: (eligibleRole) => (
										<span className="one-line-row" title={eligibleRole.schedule.roleDefinitionId || ''}>
											{eligibleRole.schedule.expandedProperties?.roleDefinition?.displayName ?? 'unknown'}
										</span>
									),
								},
								{
									accessor: 'scope',
									title: 'Scope',
									render: ({ schedule }) => {
										const icon = match(schedule.expandedProperties?.scope?.type)
											.with('resourcegroup', () => <ResourceGroups />)
											.with('subscription', () => <Subscriptions />)
											.with('managementgroup', () => <ManagementGroups />)
											.otherwise(() => <IconQuestionMark />)

										return (
											<span className="one-line-row">
												{icon}
												<span className="one-line-text" title={schedule.scope ?? ''}>
													{schedule.expandedProperties?.scope?.displayName ?? 'unknown'}
												</span>
											</span>
										)
									},
								},
								{
									accessor: 'tenant',
									title: 'Tenant',
									render: (eligibleRole) => {
										const { schedule } = eligibleRole
										if (!schedule.scope) return <span className="one-line-row">Unknown</span>
										const tenantName = tenantNameMap.get(eligibleRole.id) || 'Unknown'
										return <span className="one-line-row">{tenantName || 'Unknown'}</span>
									},
								},
								{
									accessor: 'actions',
									title: '',
									width: '80',
									render: (eligibleRole: EligibleRole, index: number) => (
										<div className="one-line-row">
											<Group gap={4} justify="right" wrap="nowrap">
												<ActionIcon
													size="sm"
													variant="subtle"
													color="green"
													onClick={() => handleActivateClick(eligibleRole, index)}
													loaderProps={{
														color: 'blue',
													}}
												>
													<IconPlayerPlay size={16} />
												</ActionIcon>
											</Group>
										</div>
									),
								},
							]}
						/>
					) : (
						<Text>No role eligibility schedules found.</Text>
					)}
				</Stack>
			</Paper>

			{/* Role Activation Modal */}
			<Modal
				opened={activationModalOpen}
				onClose={() => setActivationModalOpen(false)}
				title={
					<Title order={3}>
						Activate Role:
						{selectedEligibleRoles[0].schedule.expandedProperties?.roleDefinition?.displayName ?? 'Unknown'}
					</Title>
				}
				size="lg"
			>
				<Stack>
					<Text fw={600}>
						Scope: {selectedEligibleRoles[0].schedule.expandedProperties?.scope?.displayName ?? 'Unknown'}
					</Text>

					<Textarea
						label="Justification"
						placeholder="Enter reason for activation"
						value={justification}
						onChange={(e) => setJustification(e.currentTarget.value)}
						required={policyRequirements.requiresJustification}
						minRows={3}
					/>

					{policyRequirements.requiresTicket && (
						<TextInput
							label="Ticket Number"
							placeholder="Enter ticket or case number"
							value={ticketNumber}
							onChange={(e) => setTicketNumber(e.currentTarget.value)}
							required
						/>
					)}

					{!policyRequirements.requiresTicket && (
						<TextInput
							label="Ticket Number (optional)"
							placeholder="Enter ticket or case number if applicable"
							value={ticketNumber}
							onChange={(e) => setTicketNumber(e.currentTarget.value)}
						/>
					)}

					<DateTimePicker
						label="Start Time"
						value={startTime}
						onChange={(value: string | null) => {
							if (value) {
								setStartTime(new Date(value))
							}
						}}
						required
					/>

					<DateTimePicker
						label={`End Time (max ${policyRequirements.maxActivationDuration} hours)`}
						value={endTime}
						onChange={(value: string | null) => {
							setEndTime(value ? new Date(value) : null)
						}}
						clearable
					/>

					<Group justify="flex-end" mt="md">
						<Button
							variant="outline"
							color="gray"
							onClick={() => setActivationModalOpen(false)}
							leftSection={<IconX size={16} />}
						>
							Cancel
						</Button>
						<Button
							onClick={() => {
								if (!selectedEligibleRoles)
									throw new Error(
										'Selected Eligible Role was Not Set. This is a bug and doesnt work right with multisession anyways',
									)
								handleModalActivateClick(selectedEligibleRoles)
							}}
							loading={activating}
							disabled={policyRequirements.requiresJustification && !justification}
							leftSection={<IconCheck size={16} />}
						>
							Submit Activation
						</Button>
					</Group>
				</Stack>
			</Modal>

			{/* Notification */}
			{notification && (
				<Notification
					color={notification.type === 'success' ? 'green' : 'red'}
					title={notification.type === 'success' ? 'Success' : 'Error'}
					onClose={() => setNotification(null)}
					withCloseButton
					style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 1000 }}
				>
					{notification.message}
				</Notification>
			)}
		</>
	)
}

export default RoleTable
