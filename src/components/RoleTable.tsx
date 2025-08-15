import { fetchTenantNameBySubscriptionId, parseSubscriptionIdFromResourceId } from '@/common/subscriptions'
import { RoleAssignmentScheduleRequest, RoleEligibilityScheduleInstance } from '@azure/arm-authorization'
import { AccountInfo } from '@azure/msal-browser'
import { ActionIcon, Button, Center, Group, Modal, Paper, Stack, Title } from '@mantine/core'
import { useDisclosure, useMap } from '@mantine/hooks'
import { IconClick, IconPlayerPlay, IconQuestionMark, IconRefresh } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { ManagementGroups, ResourceGroups, Subscriptions } from '@threeveloper/azure-react-icons'
import { RoleActivationForm } from '@/components/RoleActivationForm'
import dayjs from 'dayjs'
import durationPlugin from 'dayjs/plugin/duration'
import relativeTimePlugin from 'dayjs/plugin/relativeTime'
import { DataTable } from 'mantine-datatable'
import { useEffect, useState } from 'react'
import { match } from 'ts-pattern'
import { getAllAccounts } from '../common/auth'
import { getMyRoleAssignmentScheduleRequests, getMyRoleEligibilityScheduleInstances } from '../common/pim'
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
export type EligibleRole = AccountRoleEligibilityScheduleInstance
type EligibleRoleId = EligibleRole['id']
type SubscriptionId = string
type TenantDisplayName = string

function RoleTable() {
	const [isActivationModalOpen, { open: openActivationModal, close: closeActivationModal }] = useDisclosure(false)
	const [selectedRole, setSelectedRole] = useState<EligibleRole | null>(null)

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
				const scheduleInstances = await Array.fromAsync(getMyRoleEligibilityScheduleInstances(account))
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

	const statusQuery = useQuery<RoleAssignmentScheduleRequest[]>({
		queryKey: ['roleActivations'],
		enabled: accountsQuery.isSuccess,
		queryFn: async () => {
			const allRoleActivations: RoleAssignmentScheduleRequest[] = []
			for (const account of accountsQuery.data ?? []) {
				const roleActivations = await Array.fromAsync(getMyRoleAssignmentScheduleRequests(account))
				allRoleActivations.push(...roleActivations)
			}
			return allRoleActivations
		},
	})

	/** Some eligible roles are in other tenants, so we want to display friendly names for these, but the role doesn't have the tenant name, only the sub name, so we need to do some lookup and cache to keep this performant */
	const subToTenantNameLookup = new Map<SubscriptionId, TenantDisplayName>()

	const tenantNameMap = useMap<EligibleRoleId, TenantDisplayName>()
	const eligibleRoles = eligibleRolesQuery.data ?? []
	/** Tracks state for role activations and refreshs the UI accordingly */
	const activationMap = useMap<EligibleRoleId, RoleAssignmentScheduleRequest>([])

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
		setSelectedRole(eligibleRole)
		openActivationModal()
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
								accessor: 'account',
								title: 'Account',
								render: eligibleRole => <span title={eligibleRole.account.username}>{eligibleRole.account.name}</span>,
							},
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
							// FIXME: Work in progress for reporting how long an active is ready
							// {
							// 	accessor: 'ActiveUntil',
							// 	title: 'Active Until',

							// 	render: eligibleRole => {
							// 		const { schedule } = eligibleRole
							// 	},
							// },
						]}
					/>
				</Stack>
			</Paper>

			<Modal
				opened={isActivationModalOpen}
				onClose={closeActivationModal}
				title="Activate Role"
				size="lg"
			>
				{selectedRole && (
					<RoleActivationForm
						eligibleRole={selectedRole}
						onClose={closeActivationModal}
					/>
				)}
			</Modal>
		</>
	)
}

export default RoleTable
