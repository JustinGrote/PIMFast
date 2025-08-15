import { fetchTenantNameBySubscriptionId, parseSubscriptionIdFromResourceId } from '@/common/subscriptions'
import { RoleAssignmentScheduleRequest, RoleEligibilityScheduleInstance } from '@azure/arm-authorization'
import { AccountInfo } from '@azure/msal-browser'
import {
	ActionIcon,
	Button,
	Center,
	Group,
	Modal,
	Notification,
	Paper,
	Slider,
	Stack,
	Text,
	Textarea,
	TextInput,
	Title,
} from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useDisclosure, useMap } from '@mantine/hooks'
import { IconCheck, IconClick, IconPlayerPlay, IconQuestionMark, IconRefresh, IconX } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { ManagementGroups, ResourceGroups, Subscriptions } from '@threeveloper/azure-react-icons'
import dayjs from 'dayjs'
import durationPlugin from 'dayjs/plugin/duration'
import relativeTimePlugin from 'dayjs/plugin/relativeTime'
import { DataTable } from 'mantine-datatable'
import { useEffect, useState } from 'react'
import { match } from 'ts-pattern'
import { getAllAccounts } from '../common/auth'
import { activateRole, getPolicyRequirements, getRoleEligibilityScheduleInstances } from '../common/pim'
import './RoleTable.css'

dayjs.extend(durationPlugin)
dayjs.extend(relativeTimePlugin)

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
type SubscriptionId = string
type TenantDisplayName = string

function RoleTable() {
	const accountsQuery = useQuery<AccountInfo[]>({
		queryKey: ['accounts'],
		queryFn: getAllAccounts,
	})

	// TODO: Perform this in parallel
	const eligibleRolesQuery = useQuery<EligibleRole[]>({
		queryKey: ['eligibleRoles'],
		enabled: accountsQuery.isSuccess,
		queryFn: async () => {
			const accounts = accountsQuery.data ?? []
			const allEligibleRoles: EligibleRole[] = []
			for (const account of accounts) {
				const scheduleInstances = await Array.fromAsync(getRoleEligibilityScheduleInstances(account))
				for (const schedule of scheduleInstances) {
					allEligibleRoles.push({
						account,
						schedule,
						id: `${account.homeAccountId}-${schedule.id}`,
					})
				}
			}
			return allEligibleRoles
		},
	})

	/** Some eligible roles are in other tenants, so we want to display friendly names for these, but the role doesn't have the tenant name, only the sub name, so we need to do some lookup and cache to keep this performant */
	const subToTenantNameLookup = new Map<SubscriptionId, TenantDisplayName>()

	const tenantNameMap = useMap<EligibleRoleId, TenantDisplayName>()
	const eligibleRoles = eligibleRolesQuery.data ?? []
	/** Tracks state for role activations and refreshs the UI accordingly */
	const activationMap = useMap<EligibleRoleId, RoleAssignmentScheduleRequest>([])
	const [isActivationModalOpen, { open: openActivationModal, close: closeActivationModal }] = useDisclosure()
	const [selectedEligibleRoles, setSelectedEligibleRoles] = useState<EligibleRole[]>([])
	const [justification, setJustification] = useState('')
	const [ticketNumber, setTicketNumber] = useState('')
	const [startTime, setStartTime] = useState<Date>(new Date())
	const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
	const [policyRequirements, setPolicyRequirements] = useState({
		requiresJustification: true,
		requiresTicket: false,
		maxDuration: 'PT8H',
	})
	const [modalError, setModalError] = useState<string | null>(null)

	const fetchTenantNames = async () => {
		if (!eligibleRoles.length) return

		for (const role of eligibleRoles) {
			const { account, schedule } = role

			if (tenantNameMap.has(role.id)) continue

			if (!schedule.scope) throw 'Schedule Doesnt have a scope. This is a bug and should not happen'
			const subscriptionId = parseSubscriptionIdFromResourceId(schedule.scope)
			if (!subscriptionId) throw new Error('Failed to parse subscription ID from schedule scope')

			// Already discovered so skip, performance optimization
			// This only changes rarely if a subscription is moved between tenants
			if (subToTenantNameLookup.has(subscriptionId)) {
				tenantNameMap.set(role.id, subToTenantNameLookup.get(subscriptionId)!)
				continue
			}

			let tenantName: TenantDisplayName | undefined
			console.debug(`Fetching tenant name for subscription ${subscriptionId} in account ${account.homeAccountId}`)

			try {
				tenantName = await fetchTenantNameBySubscriptionId(account, subscriptionId)
			} catch (err) {
				if (!(err instanceof Error)) throw err

				// If we couldn't find the tenant name, we need to handle this case
				console.warn(`Failed to fetch tenant name for subscription ${subscriptionId}: ${err.message}`)
				continue
			}

			if (!tenantName) {
				// If we couldn't find the tenant name, we need to handle this case
				console.warn(`Tenant name for subscription ${subscriptionId} returned undefined`)
				continue
			}

			console.debug(`Found tenant name "${tenantName}" for subscription ${subscriptionId}`)

			subToTenantNameLookup.set(subscriptionId, tenantName)
			tenantNameMap.set(role.id, tenantName)
		}
	}

	useEffect(() => {
		fetchTenantNames()
	}, [eligibleRoles])

	async function handleActivateClick(eligibleRole: EligibleRole) {
		setSelectedEligibleRoles([eligibleRole])
		setJustification('')
		setTicketNumber('')
		setStartTime(new Date())
		setModalError(null)

		try {
			if (eligibleRole.account) {
				// Get policy requirements for this role
				const requirements = await getPolicyRequirements(eligibleRole.account, eligibleRole.schedule)
				setPolicyRequirements(requirements)
			}
		} catch (error) {
			console.error('Error getting policy requirements:', error)
			setModalError('Failed to load policy requirements. Please try again or contact support.')
		}

		closeActivationModal()
	}

	async function handleModalActivateClick(eligibleRoles: EligibleRole[]) {
		setModalError(null)
		try {
			if (eligibleRoles.length === 0) return
			if (eligibleRoles.length > 1) throw new Error('Multiple role activation is not yet supported')

			const { account, schedule, id } = eligibleRoles[0]
			if (!id) throw new Error('Missing eligible role ID')

			// This will trigger a refresh that sets the loading to true. We put in a dummy ID until we have a real one from the API.
			activationMap.set(id, { id: 'CREATING' })
			const duration = 'PT5M'
			const activationRequest = await activateRole(account, schedule, justification, ticketNumber, startTime, duration)

			// Update the activation map with the real request. This should trigger a UI refresh
			activationMap.set(id, activationRequest)
			closeActivationModal()
			setNotification({ message: 'Role activation request submitted.', type: 'success' })
		} catch (error: unknown) {
			if (!(error instanceof Error)) {
				throw error
			}
			console.error('Error activating role:', error)
			setModalError(error?.message || 'An unexpected error occurred during activation.')
		}
	}

	return (
		<>
			<Paper
				shadow="xs"
				p="md"
				mt="xl"
			>
				<Stack>
					<Group
						justify="space-between"
						align="center"
					>
						<Title order={2}>Eligible Roles</Title>
						<Button
							disabled={true}
							variant="subtle"
							size="compact-xs"
							styles={{ root: { height: '1.5rem', minHeight: 'unset', padding: '0 0.3rem' } }}
						>
							<IconRefresh size="0.9rem" />
						</Button>
					</Group>

					<DataTable
						className="roleTable"
						withTableBorder
						borderRadius="xs"
						withColumnBorders
						striped
						fetching={eligibleRolesQuery.isFetching}
						highlightOnHover
						pinLastColumn
						// TODO: Add multiple activation support
						// selectedRecords={selectedSchedules}
						// onSelectedRecordsChange={setSelectedSchedules}
						records={eligibleRolesQuery.data}
						columns={[
							{
								accessor: 'roleDefinition',
								title: 'Role',
								render: eligibleRole => (
									<span
										className="one-line-row"
										title={eligibleRole.schedule.roleDefinitionId || ''}
									>
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
											<span
												className="one-line-text"
												title={schedule.scope ?? ''}
											>
												{schedule.expandedProperties?.scope?.displayName ?? 'unknown'}
											</span>
										</span>
									)
								},
							},
							{
								accessor: 'tenant',
								title: 'Tenant',
								render: eligibleRole => {
									const { schedule } = eligibleRole
									if (!schedule.scope) return <span className="one-line-row">Unknown</span>
									const tenantName = tenantNameMap.get(eligibleRole.id) || 'Unknown'
									return <span className="one-line-row">{tenantName || 'Unknown'}</span>
								},
							},
							{
								accessor: 'actions',
								title: (
									<Center>
										<IconClick size={16} />
									</Center>
								),
								width: '80',
								render: (eligibleRole: EligibleRole) => (
									<div className="one-line-row">
										<Group
											gap={4}
											justify="right"
											wrap="nowrap"
										>
											<ActionIcon
												size="sm"
												variant="subtle"
												color="green"
												onClick={() => handleActivateClick(eligibleRole)}
												loading={
													activationMap.has(eligibleRole.id) &&
													!['CREATING', 'Revoked', 'Provisioned'].includes(
														activationMap.get(eligibleRole.id)?.status ?? '',
													)
												}
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
				</Stack>
			</Paper>

			{/* Role Activation Modal */}
			<Modal
				opened={isActivationModalOpen}
				onClose={() => {
					closeActivationModal()
					setModalError(null)
				}}
				title={
					<Title order={3}>
						Activate Role:
						{'TODO'} {/* FIXME: Display role name */}
					</Title>
				}
				size="lg"
			>
				<Stack>
					{modalError && (
						<Notification
							color="red"
							title="Error"
							onClose={() => setModalError(null)}
							withCloseButton
						>
							{modalError}
						</Notification>
					)}

					<Text fw={600}>Scope: {'TODO'}</Text>

					<Textarea
						label="Justification"
						placeholder="Enter reason for activation"
						value={justification}
						onChange={e => setJustification(e.currentTarget.value)}
						required={policyRequirements.requiresJustification}
						minRows={3}
					/>

					<Text fw={600}>Activation Duration</Text>
					<Slider
						color="blue"
						labelAlwaysOn
						style={{ marginLeft: 16 }}
						// All values in minutes
						defaultValue={60}
						min={5}
						step={5}
						max={dayjs.duration(policyRequirements.maxDuration).asMinutes()}
						mt="md"
						label={value => {
							return dayjs.duration(value, 'minutes').humanize()
						}}
					/>

					{/* Optional Parameters Section */}
					<Title
						order={5}
						mt="md"
					>
						Optional Parameters
					</Title>
					{/* You can add more optional fields here as needed */}

					{policyRequirements.requiresTicket && (
						<TextInput
							label="Ticket Number"
							placeholder="Enter ticket or case number"
							value={ticketNumber}
							onChange={e => setTicketNumber(e.currentTarget.value)}
							required
						/>
					)}

					{!policyRequirements.requiresTicket && (
						<TextInput
							label="Ticket Number (optional)"
							placeholder="Enter ticket or case number if applicable"
							value={ticketNumber}
							onChange={e => setTicketNumber(e.currentTarget.value)}
						/>
					)}

					<DateTimePicker
						label="Custom Start Time (optional)"
						value={startTime}
						onChange={(value: string | null) => {
							if (value) {
								setStartTime(new Date(value))
							}
						}}
					/>

					<Group
						justify="flex-end"
						mt="md"
					>
						<Button
							variant="outline"
							color="gray"
							onClick={() => closeActivationModal()}
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
