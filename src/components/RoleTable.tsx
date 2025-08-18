import { getAzurePortalUrl, getResourceIdFromPortalUrl } from '@/common/azureResourceId'
import { fetchTenantNameBySubscriptionId, parseSubscriptionIdFromResourceId } from '@/common/subscriptions'
import { throwIfNotError } from '@/common/util'
import { RoleActivationForm } from '@/components/RoleActivationForm'
import { KnownStatus, RoleAssignmentScheduleInstance, RoleEligibilityScheduleInstance } from '@azure/arm-authorization'
import { AccountInfo } from '@azure/msal-browser'
import { ActionIcon, Button, Center, Group, Modal, Paper, Skeleton, Stack, TextInput, Title } from '@mantine/core'
import { useDisclosure, useMap } from '@mantine/hooks'
import {
	IconClick,
	IconPlayerPlay,
	IconPlayerStop,
	IconQuestionMark,
	IconRefresh,
	IconSearch,
} from '@tabler/icons-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ManagementGroups, ResourceGroups, Subscriptions } from '@threeveloper/azure-react-icons'
import dayjs from 'dayjs'
import durationPlugin from 'dayjs/plugin/duration'
import relativeTimePlugin from 'dayjs/plugin/relativeTime'
import { DataTable, DataTableSortStatus } from 'mantine-datatable'
import { useEffect, useMemo, useState } from 'react'
import { match } from 'ts-pattern'
import { getAllAccounts } from '../common/auth'
import {
	deactivateEligibleRole,
	getMyRoleAssignmentScheduleInstances,
	getMyRoleEligibilityScheduleInstances,
} from '../common/pim'
import './RoleTable.css'

dayjs.extend(durationPlugin)
dayjs.extend(relativeTimePlugin)

// FIXME: Handle if a tenant doesn't have P2 license

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
	const [isActivationModalOpened, { open: openActivationModal, close: closeActivationModal }] = useDisclosure(false)
	const [selectedRole, setSelectedRole] = useState<EligibleRole | null>(null)
	const [sortStatus, setSortStatus] = useState<DataTableSortStatus<EligibleRole>>({
		columnAccessor: 'account',
		direction: 'asc',
	})
	const [query, setQuery] = useState('')

	const accountsQuery = useQuery<AccountInfo[]>({
		queryKey: ['accounts'],
		queryFn: getAllAccounts,
	})

	const { data: currentTab, refetch } = useQuery<chrome.tabs.Tab | undefined>({
		queryKey: ['currentTab'],
		queryFn: async () => {
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
			return tab
		},
	})

	chrome.tabs.onUpdated.addListener((_tabId, _changeInfo, tab) => {
		// We only care about updates to the active tab for this side panel.
		if (tab.active && tab.windowId === currentTab?.windowId) {
			refetch()
		}
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

	type HomeAccountInfoId = AccountInfo['homeAccountId']
	type RoleAssignmentsByAccount = Record<HomeAccountInfoId, RoleAssignmentScheduleInstance[]>
	const roleAssignmentsScheduleInstancesByAccountQuery = useQuery<RoleAssignmentsByAccount>({
		queryKey: ['roleAssignmentScheduleInstances'],
		enabled: accountsQuery.isSuccess,
		queryFn: async () => {
			const accounts = accountsQuery.data ?? []

			// Fetch schedule instances for all accounts in parallel
			const accountSchedulePromises = accounts.map(async account => ({
				account,
				schedules: await Array.fromAsync(getMyRoleAssignmentScheduleInstances(account)),
			}))

			const accountScheduleResults = await Promise.all(accountSchedulePromises)

			// Reconstruct the lookup object
			const roleAssignmentsByAccount: RoleAssignmentsByAccount = {}
			for (const result of accountScheduleResults) {
				roleAssignmentsByAccount[result.account.homeAccountId] = result.schedules
			}

			return roleAssignmentsByAccount
		},
	})

	type RoleToStatusLookup = Record<EligibleRoleId, RoleAssignmentScheduleInstance | undefined>
	const roleStatusQuery = useQuery<RoleToStatusLookup>({
		queryKey: ['eligibleRoleStatus'],
		enabled: eligibleRolesQuery.isSuccess && roleAssignmentsScheduleInstancesByAccountQuery.isSuccess,
		queryFn: () => {
			const roleToStatusLookup: RoleToStatusLookup = {}
			const roleAssignmentAccountMap = roleAssignmentsScheduleInstancesByAccountQuery.data ?? {}
			const eligibleRoles = eligibleRolesQuery.data ?? []

			for (const role of eligibleRoles) {
				roleToStatusLookup[role.id] = roleAssignmentAccountMap[role.account.homeAccountId]?.find(
					assignment => assignment.linkedRoleEligibilityScheduleInstanceId === role.schedule.id,
				)
			}
			return roleToStatusLookup
		},
	})

	const deactivateEligibleRoleMutation = useMutation({
		mutationKey: ['deactivateEligibleRole'],
		mutationFn: deactivateEligibleRole,
	})

	function isEligibleRoleActivated(role: EligibleRole): boolean {
		if (!roleStatusQuery.data) return false
		return roleStatusQuery.data[role.id]?.status === KnownStatus.Provisioned
	}

	/** Azure PIM has a undocumented requirement that a role must be activated at least 5 minutes before it can be deactivated. We use this function to determine if that is the case, for purposes of disabling the stop button for instance */
	function isEligibleRoleNewlyActivated(role: EligibleRole): boolean {
		const AZURE_PIM_MIN_ACTIVATION_TIME = 5
		if (!roleStatusQuery.data) return false
		const startDateTime = roleStatusQuery.data[role.id]?.startDateTime
		if (!startDateTime) return false
		return dayjs().diff(dayjs(startDateTime), 'minutes') < AZURE_PIM_MIN_ACTIVATION_TIME
	}

	/** Some eligible roles are in other tenants, so we want to display friendly names for these, but the role doesn't have the tenant name, only the sub name, so we need to do some lookup and cache to keep this performant */
	const subToTenantNameLookup = new Map<SubscriptionId, TenantDisplayName>()

	const tenantNameMap = useMap<EligibleRoleId, TenantDisplayName>()
	const eligibleRoles = eligibleRolesQuery.data ?? []

	const fetchTenantNames = async () => {
		if (!eligibleRoles.length) return

		for (const role of eligibleRoles) {
			const { account, schedule } = role

			if (tenantNameMap.has(role.id)) continue

			if (!schedule.scope) throw new Error('Schedule Doesnt have a scope. This is a bug and should not happen')
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
		if (!isEligibleRoleActivated(eligibleRole)) {
			openActivationModal()
		} else {
			deactivateEligibleRoleMutation.mutate(eligibleRole)
		}
	}

	// Filter and sort the eligible roles
	const filteredAndSortedRoles = useMemo(() => {
		let filtered = eligibleRoles

		// Apply search filter
		if (query) {
			const lowerQuery = query.toLowerCase()
			filtered = filtered.filter(role => {
				const accountName = role.account.name?.toLowerCase() || ''
				const roleName = role.schedule.expandedProperties?.roleDefinition?.displayName?.toLowerCase() || ''
				const scopeName = role.schedule.expandedProperties?.scope?.displayName?.toLowerCase() || ''
				const tenantName = tenantNameMap.get(role.id)?.toLowerCase() || ''

				return (
					accountName.includes(lowerQuery) ||
					roleName.includes(lowerQuery) ||
					scopeName.includes(lowerQuery) ||
					tenantName.includes(lowerQuery)
				)
			})
		}

		// Apply sorting
		if (sortStatus.columnAccessor && sortStatus.direction) {
			filtered.sort((a, b) => {
				let aValue: string = ''
				let bValue: string = ''

				switch (sortStatus.columnAccessor) {
					case 'account':
						aValue = a.account.name || ''
						bValue = b.account.name || ''
						break
					case 'roleDefinition':
						aValue = a.schedule.expandedProperties?.roleDefinition?.displayName || ''
						bValue = b.schedule.expandedProperties?.roleDefinition?.displayName || ''
						break
					case 'scope':
						aValue = a.schedule.expandedProperties?.scope?.displayName || ''
						bValue = b.schedule.expandedProperties?.scope?.displayName || ''
						break
					case 'tenant':
						aValue = tenantNameMap.get(a.id) || ''
						bValue = tenantNameMap.get(b.id) || ''
						break
					default:
						return 0
				}

				const comparison = aValue.localeCompare(bValue)
				return sortStatus.direction === 'desc' ? -comparison : comparison
			})
		}

		return filtered
	}, [eligibleRoles, query, sortStatus, tenantNameMap])

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

					<TextInput
						placeholder="Search roles, accounts, scopes, or tenants..."
						leftSection={<IconSearch size={16} />}
						value={query}
						onChange={event => setQuery(event.currentTarget.value)}
						mb="md"
					/>

					<DataTable
						className="roleTable"
						withTableBorder
						borderRadius="xs"
						withColumnBorders
						striped
						fetching={eligibleRolesQuery.isFetching}
						highlightOnHover
						pinLastColumn
						sortStatus={sortStatus}
						onSortStatusChange={setSortStatus}
						rowColor={({ schedule }) => {
							if (!currentTab?.url) {
								return undefined
							}
							try {
								const resourceUri = getResourceIdFromPortalUrl(currentTab.url)
								if (resourceUri.startsWith(schedule.scope!)) {
									return 'green'
								}
							} catch (error: unknown) {
								throwIfNotError(error)
								console.debug(`Failed to find resource ID in ${currentTab.url}: ${error.message}`)
							}
							return undefined
						}}
						// TODO: Add multiple activation support
						// selectedRecords={selectedSchedules}
						// onSelectedRecordsChange={setSelectedSchedules}
						records={filteredAndSortedRoles}
						columns={[
							{
								accessor: 'account',
								title: 'Account',
								sortable: true,
								render: eligibleRole => <span title={eligibleRole.account.username}>{eligibleRole.account.name}</span>,
							},
							{
								accessor: 'roleDefinition',
								title: 'Role',
								sortable: true,
								render: eligibleRole => (
									<span title={eligibleRole.schedule.roleDefinitionId || ''}>
										{eligibleRole.schedule.expandedProperties?.roleDefinition?.displayName ?? 'unknown'}
									</span>
								),
							},
							{
								accessor: 'scope',
								title: 'Scope',
								sortable: true,
								render: ({ schedule }) => {
									const icon = match(schedule.expandedProperties?.scope?.type)
										.with('resourcegroup', () => <ResourceGroups />)
										.with('subscription', () => <Subscriptions />)
										.with('managementgroup', () => <ManagementGroups />)
										.otherwise(() => <IconQuestionMark />)
									const displayName = schedule.expandedProperties?.scope?.displayName ?? 'unknown'
									const portalUrl = schedule.scope
										? getAzurePortalUrl(schedule.scope, schedule.expandedProperties?.scope?.type)
										: '#'

									return (
										<Group
											gap="xs"
											wrap="nowrap"
										>
											{icon}
											<a
												href={portalUrl}
												target="_blank"
												rel="noopener noreferrer"
												title={schedule.scope ?? ''}
												style={{ textDecoration: 'none', color: 'inherit' }}
											>
												{displayName}
											</a>
										</Group>
									)
								},
							},
							{
								accessor: 'tenant',
								title: 'Tenant',
								sortable: true,
								render: eligibleRole => {
									const { schedule } = eligibleRole
									if (!schedule.scope) return <span>Unknown</span>
									const tenantName = tenantNameMap.get(eligibleRole.id) || 'Unknown'
									return (
										<Skeleton visible={!tenantName}>
											<span>{tenantName}</span>
										</Skeleton>
									)
								},
							},
							{
								accessor: 'actions',
								title: (
									<Center>
										<IconClick size={16} />
									</Center>
								),
								render: (eligibleRole: EligibleRole) => (
									<div className="one-line-row">
										<Group>
											<ActionIcon
												size="sm"
												variant="subtle"
												disabled={isEligibleRoleNewlyActivated(eligibleRole)}
												onClick={() => {
													handleActivateClick(eligibleRole)
												}}
												loaderProps={{
													color: 'blue',
												}}
											>
												<Skeleton visible={!roleStatusQuery.isSuccess}>
													{isEligibleRoleActivated(eligibleRole) ? (
														<IconPlayerStop
															size="sm"
															color={isEligibleRoleNewlyActivated(eligibleRole) ? undefined : 'red'}
															title={
																isEligibleRoleNewlyActivated(eligibleRole)
																	? `Role must be active for a minimu of at least 5 minutes before it can be disabled`
																	: 'Deactivate Role'
															}
														/>
													) : (
														<IconPlayerPlay
															size="sm"
															color="green"
														/>
													)}
												</Skeleton>
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
				opened={isActivationModalOpened}
				onClose={closeActivationModal}
				title="Activate Role"
				size="lg"
			>
				{selectedRole && (
					<RoleActivationForm
						eligibleRole={selectedRole}
						onSuccess={closeActivationModal}
					/>
				)}
			</Modal>
		</>
	)
}

export default RoleTable
