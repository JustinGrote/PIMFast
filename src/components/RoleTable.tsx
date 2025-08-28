import { getAzurePortalUrl, getResourceIdFromPortalUrl } from '@/api/azureResourceId'
import { getMilliseconds } from '@/api/time'
import { throwIfNotError } from '@/api/util'
import { AzureResource } from '@/components/icons/AzureResource'
import { RoleActivationForm } from '@/components/RoleActivationForm'
import { armScheduleToCommon, graphScheduleToCommon, groupScheduleToCommon } from '@/model/CommonRoleSchedule'
import { EligibleRole } from '@/model/EligibleRole'
import { KnownStatus, RoleAssignmentScheduleInstance } from '@azure/arm-authorization'
import { AccountInfo } from '@azure/msal-browser'
import { ActionIcon, Button, Center, Group, LoadingOverlay, Modal, Paper, Skeleton, Stack, TextInput, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconClearAll, IconClick, IconPlayerPlay, IconPlayerStop, IconRefresh, IconSearch } from '@tabler/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EntraConnect, Groups, ManagementGroups, ResourceGroups, Subscriptions } from '@threeveloper/azure-react-icons'
import { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community'
import dayjs from 'dayjs'
import durationPlugin from 'dayjs/plugin/duration'
import relativeTimePlugin from 'dayjs/plugin/relativeTime'
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
import ExpiresCountdown from './ExpiresCountdown'
import MantineAgGridReact from './MantineAgGridReact'
import ResolvedTenantName from './ResolvedTenantName'
import './RoleTable.css'

dayjs.extend(durationPlugin)
dayjs.extend(relativeTimePlugin)

// FIXME: Handle if a tenant doesn't have P2 license

function RoleTable() {
	const [isActivationModalOpened, { open: openActivationModal, close: closeActivationModal }] = useDisclosure(false)
	const [selectedRole, setSelectedRole] = useState<EligibleRole | null>(null)
	const [gridApi, setGridApi] = useState<GridApi<EligibleRole> | null>(null)

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

	const columnDefs: ColDef<EligibleRole>[] = useMemo(
		() => [
			{
				field: 'schedule.roleDefinitionDisplayName',
				headerName: 'Role',
				cellRenderer: (params: { data: EligibleRole }) => (
					<div>
						<span title={params.data.schedule.roleDefinitionId || ''}>
							{params.data.schedule.roleDefinitionDisplayName ?? 'unknown'}
						</span>
					</div>
				),
				flex: 2,
				sortable: true,
				resizable: true,
			},
			{
				headerName: 'Scope',
				cellRenderer: (params: { data: EligibleRole }) => {
					const { schedule } = params.data
					const icon = match(schedule.scopeType)
						.with('resourcegroup', () => <ResourceGroups />)
						.with('subscription', () => <Subscriptions />)
						.with('managementgroup', () => <ManagementGroups />)
						.with('directory', () => <EntraConnect />)
						.with('group', () => <Groups />)
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
				flex: 2,
				sortable: true,
				resizable: true,
				valueGetter: params => params.data?.schedule.scopeDisplayName || '',
			},
			{
				headerName: 'Expires',
				cellRenderer: (params: { data: EligibleRole }) => {
					return params.data.schedule.endDateTime ? (
						<ExpiresCountdown futureDate={params.data.schedule.endDateTime} />
					) : (
						<span title="No expiration">Permanent</span>
					)
				},
				flex: 1,
				sortable: false,
				resizable: true,
				valueGetter: params => params.data?.schedule.endDateTime || '',
			},
			{
				field: 'account.name',
				headerName: 'Account',
				cellRenderer: (params: { data: EligibleRole }) => (
					<span title={params.data.account.username}>{params.data.account.name}</span>
				),
				flex: 1,
				sortable: true,
				resizable: true,
			},
			{
				headerName: 'Tenant',
				cellRenderer: (params: { data: EligibleRole }) => {
					return (
						<ResolvedTenantName
							account={params.data.account}
							roleOrTenantId={params.data}
						/>
					)
				},
				flex: 1,
				sortable: false,
				resizable: true,
			},
			{
				headerName: '',
				headerComponent: () => (
					<Center>
						<IconClick size={16} />
					</Center>
				),
				cellRenderer: (params: { data: EligibleRole }) => (
					<div className="one-line-row">
						<Group>
							<ActionIcon
								size="sm"
								variant="subtle"
								disabled={!canActivateRole(params.data) || isEligibleRoleNewlyActivated(params.data)}
								onClick={() => {
									handleActivateClick(params.data)
								}}
								loaderProps={{
									color: 'blue',
								}}
							>
								<Skeleton visible={!roleStatusQuery.isSuccess}>
									{!canActivateRole(params.data) ? (
										<IconClick
											size="sm"
											color="gray"
											title={
												params.data.schedule.sourceType === 'graph'
													? 'Entra ID role activation not yet supported'
													: params.data.schedule.sourceType === 'group'
														? 'Group role activation not yet supported'
														: 'Role activation not supported'
											}
										/>
									) : isEligibleRoleActivated(params.data) ? (
										<IconPlayerStop
											size="sm"
											color={isEligibleRoleNewlyActivated(params.data) ? undefined : 'red'}
											title={
												isEligibleRoleNewlyActivated(params.data)
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
				width: 80,
				pinned: 'right',
				sortable: false,
				resizable: false,
			},
		],
		[roleStatusQuery.isSuccess],
	)

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

	// Filter the eligible roles based on search query
	const filteredRoles = useMemo(() => {
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

		return filtered
	}, [filterQuery, eligibleRolesQuery.data])

	const onGridReady = (params: GridReadyEvent<EligibleRole>) => {
		setGridApi(params.api)
	}

	const getRowStyle = (params: { data: EligibleRole }) => {
		if (!currentTab?.url || !params.data) {
			return undefined
		}
		try {
			const resourceUri = getResourceIdFromPortalUrl(currentTab.url)
			if (resourceUri.startsWith(params.data.schedule.scope!)) {
				return { backgroundColor: 'var(--mantine-color-gray-7)' }
			}
		} catch (error: unknown) {
			throwIfNotError(error)
			console.debug(`Failed to find resource ID in ${currentTab.url}: ${error.message}`)
		}
		return undefined
	}

	const resetColumnsOrder = () => {
		if (gridApi) {
			gridApi.resetColumnState()
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
						<Group>
							<Button
								disabled={eligibleRolesQuery.isFetching}
								variant="subtle"
								color="green"
								size="compact-xs"
								onClick={refresh}
							>
								<IconRefresh />
							</Button>
							<Button
								variant="subtle"
								color="gray"
								size="compact-xs"
								onClick={resetColumnsOrder}
							>
								<IconClearAll />
							</Button>
						</Group>
					</Group>

					<TextInput
						placeholder="Search roles, accounts, scopes, or tenants..."
						leftSection={<IconSearch size={16} />}
						value={filterQuery}
						onChange={event => setFilterQuery(event.currentTarget.value)}
						mb="md"
					/>

					<div style={{ height: '600px', width: '100%', position: 'relative' }}>
						<LoadingOverlay
							visible={eligibleRolesQuery.isLoading || eligibleRolesQuery.isFetching}
							zIndex={1000}
							overlayProps={{ radius: 'sm', blur: 2 }}
						/>
						<MantineAgGridReact
							className="roleTable"
							rowData={filteredRoles}
							columnDefs={columnDefs}
							loading={eligibleRolesQuery.isFetching}
							getRowId={params => params.data.id}
							onGridReady={onGridReady}
							getRowStyle={getRowStyle}
							domLayout="normal"
							suppressHorizontalScroll={false}
							rowSelection="single"
							defaultColDef={{
								sortable: true,
								filter: true,
								resizable: true,
							}}
						/>
					</div>
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
