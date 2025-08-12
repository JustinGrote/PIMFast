import { fetchTenantNameByResourceId } from '@/common/subscriptions'
import { RoleAssignmentScheduleInstance, RoleEligibilityScheduleInstance } from '@azure/arm-authorization'
import { AccountInfo } from '@azure/msal-browser'
import {
	Button,
	Checkbox,
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
import { IconCheck, IconPlayerPlay, IconQuestionMark, IconRefresh, IconX } from '@tabler/icons-react'
import { ManagementGroups, ResourceGroups, Subscriptions } from '@threeveloper/azure-react-icons'
import { DataTable } from 'mantine-datatable'
import React, { useEffect, useState } from 'react'
import { getAllAccounts } from '../common/auth'
import { createRoleActivationRequest, getPolicyRequirements, getRoleEligibilityScheduleInstances } from '../common/pim'
import './RoleTable.css'

interface RoleTableProps {
	onRefresh?: () => void
}

const RoleTable: React.FC<RoleTableProps> = ({ onRefresh }) => {
	const [loadingRoles, setLoadingRoles] = useState(false)
	const [roleSchedules, setRoleSchedules] = useState<RoleEligibilityScheduleInstance[]>([])
	const [accounts, setAccounts] = useState<AccountInfo[]>([])
	const [tenantNames, setTenantNames] = useState<{ [scope: string]: string }>({})
	const [checkedRows, setCheckedRows] = useState<{ [key: number]: boolean }>({})

	// Activation modal state
	const [activationModalOpen, setActivationModalOpen] = useState(false)
	const [selectedSchedule, setSelectedSchedule] = useState<RoleEligibilityScheduleInstance | null>(null)
	const [justification, setJustification] = useState('')
	const [ticketNumber, setTicketNumber] = useState('')
	const [startTime, setStartTime] = useState<Date>(new Date())
	const [endTime, setEndTime] = useState<Date | null>(null)
	const [activating, setActivating] = useState(false)
	const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
	const [policyRequirements, setPolicyRequirements] = useState({
		requiresJustification: true,
		requiresTicket: false,
		maxActivationDuration: 8,
	})

	const fetchRoleSchedules = async () => {
		setLoadingRoles(true)
		try {
			setAccounts(await getAllAccounts())
			const allRoleSchedules: RoleEligibilityScheduleInstance[] = []
			for (const account of accounts) {
				for await (const schedule of getRoleEligibilityScheduleInstances(account)) {
					allRoleSchedules.push(schedule)
				}
			}
			setRoleSchedules(allRoleSchedules)
		} catch (error) {
			console.error('Error loading role schedules:', error)
		} finally {
			setLoadingRoles(false)
		}
	}

	useEffect(() => {
		fetchRoleSchedules()
	}, [onRefresh])

	useEffect(() => {
		const fetchTenantNames = async () => {
			if (!accounts.length || !roleSchedules.length) return
			const names: { [scope: string]: string } = {}
			for (const schedule of roleSchedules) {
				if (schedule.scope && !(schedule.scope in names)) {
					try {
						names[schedule.scope] = (await fetchTenantNameByResourceId(accounts[0], schedule.scope)) || 'Unknown'
					} catch {
						names[schedule.scope] = 'Unknown'
					}
				}
			}
			setTenantNames(names)
		}
		fetchTenantNames()
	}, [roleSchedules])

	const handleActivateClick = async (schedule: RoleAssignmentScheduleInstance) => {
		setSelectedSchedule(schedule)
		setJustification('')
		setTicketNumber('')
		setStartTime(new Date())

		try {
			if (accounts.length > 0) {
				// Get policy requirements for this role
				const requirements = await getPolicyRequirements(accounts[0], schedule)
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

	const handleActivateRole = async () => {
		if (!selectedSchedule || !accounts.length) return

		setActivating(true)
		try {
			await createRoleActivationRequest(
				accounts[0],
				selectedSchedule,
				justification,
				ticketNumber || undefined,
				startTime,
				endTime || undefined,
			)

			setNotification({
				message: 'Role activation request submitted successfully!',
				type: 'success',
			})
			setActivationModalOpen(false)

			// Refresh the list after activation
			fetchRoleSchedules()
		} catch (error) {
			console.error('Error activating role:', error)
			setNotification({
				message: `Error activating role: ${error instanceof Error ? error.message : 'Unknown error'}`,
				type: 'error',
			})
		} finally {
			setActivating(false)
		}
	}

	return (
		<>
			<Paper shadow="xs" p="md" mt="xl">
				<Stack>
					<Group justify="space-between" align="center">
						<Title order={2}>Eligible Roles</Title>
						<Button
							onClick={fetchRoleSchedules}
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
					) : roleSchedules.length > 0 ? (
						<DataTable
							className="roleTable"
							withTableBorder
							borderRadius="xs"
							withColumnBorders
							striped
							highlightOnHover
							records={roleSchedules}
							columns={[
								{
									accessor: 'actions',
									title: '',
									width: '80',
									render: (schedule: RoleEligibilityScheduleInstance, index: number) => (
										<div className="one-line-row">
											<Checkbox
												checked={!!checkedRows[index]}
												onChange={() =>
													setCheckedRows((prev) => ({
														...prev,
														[index]: !prev[index],
													}))
												}
												className="one-line-checkbox"
											/>
											<Button
												variant="subtle"
												color="green"
												size="xs"
												className="one-line-button"
												onClick={() => handleActivateClick(schedule)}
												styles={{ root: { height: '1.5rem', minHeight: 'unset', padding: '0 0.3rem' } }}
											>
												<IconPlayerPlay size="0.9rem" />
											</Button>
										</div>
									),
								},
								{
									accessor: 'roleDefinition',
									title: 'Role',
									render: (schedule: RoleAssignmentScheduleInstance) => (
										<span className="one-line-row" title={schedule.roleDefinitionId || ''}>
											{schedule.expandedProperties?.roleDefinition?.displayName ?? 'unknown'}
										</span>
									),
								},
								{
									accessor: 'scope',
									title: 'Scope',
									render: (schedule: RoleAssignmentScheduleInstance) => {
										let icon
										switch (schedule.expandedProperties?.scope?.type) {
											case 'resourcegroup':
												icon = <ResourceGroups />
												break
											case 'subscription':
												icon = <Subscriptions />
												break
											case 'managementgroup':
												icon = <ManagementGroups />
												break
											default:
												icon = <IconQuestionMark />
										}
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
									render: (schedule: RoleAssignmentScheduleInstance) => {
										if (!schedule.scope) return <span className="one-line-row">Unknown</span>
										const tenantName = tenantNames[schedule.scope]
										return <span className="one-line-row">{tenantName || 'Unknown'}</span>
									},
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
					<Title order={3}>Activate Role: {selectedSchedule?.expandedProperties?.roleDefinition?.displayName}</Title>
				}
				size="lg"
			>
				<Stack>
					<Text fw={600}>Scope: {selectedSchedule?.expandedProperties?.scope?.displayName}</Text>

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
							onClick={handleActivateRole}
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
