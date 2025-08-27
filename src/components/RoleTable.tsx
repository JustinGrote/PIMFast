import { getAzurePortalUrl, getResourceIdFromPortalUrl } from '@/api/azureResourceId'
import { getMilliseconds } from '@/api/time'
import { throwIfNotError } from '@/api/util'
import { AzureResource } from '@/components/icons/AzureResource'
import { RoleActivationForm } from '@/components/RoleActivationForm'
import { armScheduleToCommon, graphScheduleToCommon, groupScheduleToCommon } from '@/model/CommonRoleSchedule'
import { EligibleRole } from '@/model/EligibleRole'
import { KnownStatus, RoleAssignmentScheduleInstance } from '@azure/arm-authorization'
import { AccountInfo } from '@azure/msal-browser'
import { ActionIcon, Button, Center, Group, Modal, Paper, Skeleton, Stack, TextInput, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconClick, IconPlayerPlay, IconPlayerStop, IconRefresh, IconSearch, IconUsers } from '@tabler/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ManagementGroups, ResourceGroups, Subscriptions } from '@threeveloper/azure-react-icons'
import dayjs from 'dayjs'
import durationPlugin from 'dayjs/plugin/duration'
import relativeTimePlugin from 'dayjs/plugin/relativeTime'
import { DataTable, DataTableSortStatus, useDataTableColumns } from 'mantine-datatable'
import { useMemo, useState } from 'react'
import { match } from 'ts-pattern'
import { getAllAccounts } from '../api/auth'
import {
	deactivateEligibleRole,
	getMyRoleAssignmentScheduleInstances,
	getMyRoleEligibilityScheduleInstances,
} from '../api/pim'
import {
	getMyEntraGroupEligibilityScheduleInstances,
	getMyEntraRoleEligibilityScheduleInstances,
} from '../api/pimGraph'
import ResolvedTenantName from './ResolvedTenantName'
import './RoleTable.css'

dayjs.extend(durationPlugin)
dayjs.extend(relativeTimePlugin)

// FIXME: Handle if a tenant doesn't have P2 license

function RoleTable() {
	const [isActivationModalOpened, { open: openActivationModal, close: closeActivationModal }] = useDisclosure(false)
	const [selectedRole, setSelectedRole] = useState<EligibleRole | null>(null)
	const [sortStatus, setSortStatus] = useState<DataTableSortStatus<EligibleRole>>({
		columnAccessor: 'account',
		direction: 'asc',
	})
	const storeColumnsKey = 'eligibleRoles'
	const { effectiveColumns, resetColumnsOrder } = useDataTableColumns<EligibleRole>({
		key: storeColumnsKey,
		columns: [
			{
				accessor: 'roleDefinition',
				title: 'Role',
				resizable: true,
				sortable: true,
				render: eligibleRole => (
					<div>
						<span title={eligibleRole.schedule.roleDefinitionId || ''}>
							{eligibleRole.schedule.roleDefinitionDisplayName ?? 'unknown'}
						</span>
					</div>
				),
			},
			{
				accessor: 'scope',
				title: 'Scope',
				resizable: true,
				sortable: true,
				render: ({ schedule }) => {
					const icon = match(schedule.scopeType)
						.with('resourcegroup', () => <ResourceGroups />)
						.with('subscription', () => <Subscriptions />)
						.with('managementgroup', () => <ManagementGroups />)
						.with('directory', () => <AzureResource />)
						.with('group', () => <IconUsers size={16} />)
						.otherwise(() => <AzureResource />)
					const displayName = schedule.scopeDisplayName ?? 'unknown'
					const portalUrl = schedule.scope ? getAzurePortalUrl(schedule.scope, schedule.scopeType) : '#'

					return (
						<Group
							gap="xs"
							wrap="nowrap"
							style={{ minWidth: 0, flex: 1 }}
						>
							{icon}
							<a
								href={portalUrl}
								target="_blank"
								rel="noopener noreferrer"
								title={schedule.scope ?? ''}
								style={{
									textDecoration: 'none',
									color: 'inherit',
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
									minWidth: 0,
									flex: 1,
								}}
							>
								{displayName}
							</a>
						</Group>
					)
				},
			},
			{
				accessor: 'account',
				title: 'Account',
				sortable: true,
				resizable: true,
				render: eligibleRole => <span title={eligibleRole.account.username}>{eligibleRole.account.name}</span>,
			},
			{
				accessor: 'tenant',
				title: 'Tenant',
				resizable: true,
				sortable: false, //TODO: Reimplement
				render: eligibleRole => {
					return (
						<ResolvedTenantName
							account={eligibleRole.account}
							roleOrTenantId={eligibleRole}
						/>
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
				resizable: false,
				render: eligibleRole => (
					<div className="one-line-row">
						<Group>
							<ActionIcon
								size="sm"
								variant="subtle"
								disabled={!canActivateRole(eligibleRole) || isEligibleRoleNewlyActivated(eligibleRole)}
								onClick={() => {
									handleActivateClick(eligibleRole)
								}}
								loaderProps={{
									color: 'blue',
								}}
							>
								<Skeleton visible={!roleStatusQuery.isSuccess}>
									{!canActivateRole(eligibleRole) ? (
										<IconClick
											size="sm"
											color="gray"
											title={
												eligibleRole.schedule.sourceType === 'graph'
													? 'Entra ID role activation not yet supported'
													: eligibleRole.schedule.sourceType === 'group'
														? 'Group role activation not yet supported'
														: 'Role activation not supported'
											}
										/>
									) : isEligibleRoleActivated(eligibleRole) ? (
										<IconPlayerStop
											size="sm"
											color={isEligibleRoleNewlyActivated(eligibleRole) ? undefined : 'red'}
											title={
												isEligibleRoleNewlyActivated(eligibleRole)
													? `Role must be active for a minimum of at least 5 minutes before it can be disabled`
													: 'Deactivate Role'
											}
										/>
									) : (
										<IconPlayerPlay
											size="sm"
											color="green"
											title="Activate Role"
										/>
									)}
								</Skeleton>
							</ActionIcon>
						</Group>
					</div>
				),
			},
		],
	})

	const queryClient = useQueryClient()
	const [filterQuery, setFilterQuery] = useState('')

	const accountsQuery = useQuery<AccountInfo[]>({
		queryKey: ['pim', 'accounts'],
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
		queryKey: ['pim', 'eligibleRoles', accountsQuery.data],
		enabled: accountsQuery.isSuccess,
		refetchInterval: getMilliseconds(10, 'seconds'),
		throwOnError: true,
		queryFn: async () => {
			const accounts = accountsQuery.data ?? []
			const allEligibleRoles: EligibleRole[] = []

			for (const account of accounts) {
				// Fetch ARM-based Azure Resource roles
				const armScheduleInstances = await Array.fromAsync(getMyRoleEligibilityScheduleInstances(account))
				for (const schedule of armScheduleInstances) {
					const commonSchedule = armScheduleToCommon(schedule)
					allEligibleRoles.push({
						account,
						schedule: commonSchedule,
						id: `${account.homeAccountId}-arm-${commonSchedule.id}`,
					})
				}

				// Fetch Graph-based Entra ID roles
				try {
					const graphScheduleInstances = await getMyEntraRoleEligibilityScheduleInstances(account)
					for (const schedule of graphScheduleInstances) {
						const commonSchedule = graphScheduleToCommon(schedule)
						allEligibleRoles.push({
							account,
							schedule: commonSchedule,
							id: `${account.homeAccountId}-graph-${commonSchedule.id}`,
						})
					}
				} catch (error) {
					console.warn('Failed to fetch Entra ID roles for account:', account.name, error)
					// Continue with other role types even if Graph roles fail
				}

				// Fetch Graph-based Group roles (PIM for Groups)
				try {
					const groupScheduleInstances = await getMyEntraGroupEligibilityScheduleInstances(account)
					for (const schedule of groupScheduleInstances) {
						const commonSchedule = groupScheduleToCommon(schedule)
						allEligibleRoles.push({
							account,
							schedule: commonSchedule,
							id: `${account.homeAccountId}-group-${commonSchedule.id}`,
						})
					}
				} catch (error) {
					console.warn('Failed to fetch Group roles for account:', account.name, error)
					// Continue with other role types even if Group roles fail
				}
			}

			return allEligibleRoles
		},
	})

	type HomeAccountInfoId = AccountInfo['homeAccountId']
	type RoleAssignmentsByAccount = Record<HomeAccountInfoId, RoleAssignmentScheduleInstance[]>
	const roleAssignmentsScheduleInstancesByAccountQuery = useQuery<RoleAssignmentsByAccount>({
		queryKey: ['pim', 'roleAssignmentScheduleInstances', accountsQuery.data],
		enabled: accountsQuery.isSuccess,
		refetchInterval: getMilliseconds(10, 'seconds'),
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

	type RoleToStatusLookup = Record<EligibleRole['id'], RoleAssignmentScheduleInstance | undefined>
	const roleStatusQuery = useQuery<RoleToStatusLookup>({
		queryKey: [
			'pim',
			'eligibleRoleStatus',
			eligibleRolesQuery.data,
			roleAssignmentsScheduleInstancesByAccountQuery.data,
		],
		enabled: eligibleRolesQuery.isSuccess && roleAssignmentsScheduleInstancesByAccountQuery.isSuccess,
		queryFn: () => {
			const roleToStatusLookup: RoleToStatusLookup = {}
			const roleAssignmentAccountMap = roleAssignmentsScheduleInstancesByAccountQuery.data ?? {}
			const eligibleRoles = eligibleRolesQuery.data ?? []

			for (const role of eligibleRoles) {
				// Only ARM-based roles can be checked via role assignment schedule instances
				if (role.schedule.sourceType === 'arm') {
					roleToStatusLookup[role.id] = roleAssignmentAccountMap[role.account.homeAccountId]?.find(
						assignment => assignment.linkedRoleEligibilityScheduleInstanceId === role.schedule.id,
					)
				} else {
					// Graph-based roles would need a different status checking mechanism
					roleToStatusLookup[role.id] = undefined
				}
			}
			return roleToStatusLookup
		},
	})

	async function refresh() {
		await queryClient.invalidateQueries({ queryKey: ['pim'] })
	}

	const deactivateEligibleRoleMutation = useMutation({
		mutationKey: ['deactivateEligibleRole'],
		mutationFn: deactivateEligibleRole,
	})

	function isEligibleRoleActivated(role: EligibleRole): boolean {
		if (!roleStatusQuery.data) return false
		return roleStatusQuery.data[role.id]?.status === KnownStatus.Provisioned
	}

	/** Check if a role can be activated - currently only ARM-based roles are supported */
	function canActivateRole(role: EligibleRole): boolean {
		return role.schedule.sourceType === 'arm'
	}

	/** Azure PIM has a undocumented requirement that a role must be activated at least 5 minutes before it can be deactivated. We use this function to determine if that is the case, for purposes of disabling the stop button for instance */
	function isEligibleRoleNewlyActivated(role: EligibleRole): boolean {
		const AZURE_PIM_MIN_ACTIVATION_TIME = 5
		if (!roleStatusQuery.data) return false
		const startDateTime = roleStatusQuery.data[role.id]?.startDateTime
		if (!startDateTime) return false
		return dayjs().diff(dayjs(startDateTime), 'minutes') < AZURE_PIM_MIN_ACTIVATION_TIME
	}

	async function handleActivateClick(eligibleRole: EligibleRole) {
		if (!canActivateRole(eligibleRole)) {
			console.warn('Role activation not supported for this role type:', eligibleRole.schedule.sourceType)
			return
		}

		setSelectedRole(eligibleRole)
		if (!isEligibleRoleActivated(eligibleRole)) {
			openActivationModal()
		} else {
			deactivateEligibleRoleMutation.mutate(eligibleRole)
		}
	}

	// Filter and sort the eligible roles
	const filteredAndSortedRoles = useMemo(() => {
		let filtered: EligibleRole[] = eligibleRolesQuery.data ?? []

		// Apply search filter
		if (filterQuery) {
			const lowerQuery = filterQuery.toLowerCase()
			filtered = filtered.filter(role => {
				const accountName = role.account.name?.toLowerCase() || ''
				const roleName = role.schedule.roleDefinitionDisplayName?.toLowerCase() || ''
				const scopeName = role.schedule.scopeDisplayName?.toLowerCase() || ''
				// TODO: Fix tenant search

				return (
					accountName.includes(lowerQuery) || roleName.includes(lowerQuery) || scopeName.includes(lowerQuery)
					// tenantName.includes(lowerQuery)
				)
			})
		}

		// Apply sorting
		if (sortStatus.columnAccessor) {
			filtered.sort((a, b) => {
				let aValue: string = ''
				let bValue: string = ''

				switch (sortStatus.columnAccessor) {
					case 'account':
						aValue = a.account.name || ''
						bValue = b.account.name || ''
						break
					case 'roleDefinition':
						aValue = a.schedule.roleDefinitionDisplayName || ''
						bValue = b.schedule.roleDefinitionDisplayName || ''
						break
					case 'scope':
						aValue = a.schedule.scopeDisplayName || ''
						bValue = b.schedule.scopeDisplayName || ''
						break
					// case 'tenant':
					// 	aValue = tenantNameMap.get(a.id) || ''
					// 	bValue = tenantNameMap.get(b.id) || ''
					// 	break
					default:
						return 0
				}

				const comparison = aValue.localeCompare(bValue)
				return sortStatus.direction === 'desc' ? -comparison : comparison
			})
		}

		return filtered
	}, [filterQuery, sortStatus, eligibleRolesQuery.data])

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
							disabled={eligibleRolesQuery.isFetching}
							variant="subtle"
							color="green"
							size="compact-xs"
							styles={{ root: { height: '1.5rem', minHeight: 'unset', padding: '0 0.3rem' } }}
							onClick={refresh}
						>
							<IconRefresh size="0.9rem" />
						</Button>
					</Group>

					<TextInput
						placeholder="Search roles, accounts, scopes, or tenants..."
						leftSection={<IconSearch size={16} />}
						value={filterQuery}
						onChange={event => setFilterQuery(event.currentTarget.value)}
						mb="md"
					/>

					<DataTable<EligibleRole>
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
						storeColumnsKey={storeColumnsKey}
						columns={effectiveColumns}
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
