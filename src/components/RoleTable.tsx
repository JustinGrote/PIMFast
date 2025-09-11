import { getAccountByLocalId } from '@/api/auth'
import { getAzurePortalUrl, getResourceIdFromPortalUrl } from '@/api/azureResourceId'
import { throwIfNotError } from '@/api/util'
import { AzureResource } from '@/components/icons/AzureResource'
import { RoleActivationForm } from '@/components/RoleActivationForm'
import { EligibleRole } from '@/model/EligibleRole'
import { ActionIcon, Button, Center, Group, Modal, Paper, Skeleton, Stack, Text, TextInput, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconClearAll, IconClick, IconPlayerPlay, IconPlayerStop, IconRefresh, IconSearch } from '@tabler/icons-react'
import { EntraConnect, Groups, ManagementGroups, ResourceGroups, Subscriptions } from '@threeveloper/azure-react-icons'
import { ColDef, GridApi, GridReadyEvent, RowClassParams } from 'ag-grid-community'
import dayjs from 'dayjs'
import durationPlugin from 'dayjs/plugin/duration'
import relativeTimePlugin from 'dayjs/plugin/relativeTime'
import { useMemo, useState } from 'react'
import { match } from 'ts-pattern'
import ExpiresCountdown from './ExpiresCountdown'
import MantineAgGridReact from './MantineAgGridReact'
import ResolvedTenantName from './ResolvedTenantName'
import { useRoleTableQueries } from './RoleTable.query'

dayjs.extend(durationPlugin)
dayjs.extend(relativeTimePlugin)

// FIXME: Handle if a tenant doesn't have P2 license

function RoleTable() {
	const [isActivationModalOpened, { open: openActivationModal, close: closeActivationModal }] = useDisclosure(false)
	const [selectedRole, setSelectedRole] = useState<EligibleRole | null>(null)
	const [gridApi, setGridApi] = useState<GridApi<EligibleRole> | null>(null)
	const [filterQuery, setFilterQuery] = useState('')

	const {
		accountIds,
		currentTab,
		eligibleRolesQuery,
		roleStatusQuery,
		deactivateEligibleRoleMutation,
		refresh,
		isEligibleRoleActivated,
		isEligibleRoleNewlyActivated,
	} = useRoleTableQueries()

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
				headerName: 'Account',
				cellRenderer: (params: { data: EligibleRole }) => {
					const { name, username } = getAccountByLocalId(params.data.accountId)
					return (
						<Text
							size="sm"
							title={name}
						>
							{username}
						</Text>
					)
				},
				flex: 1,
				sortable: true,
				resizable: true,
				hide: accountIds.length <= 1,
				valueGetter: params => {
					if (!params.data?.accountId) {
						return ''
					}
					return getAccountByLocalId(params.data.accountId).name
				},
			},
			{
				headerName: 'Tenant',
				cellRenderer: (params: { data: EligibleRole }) => <ResolvedTenantName role={params.data} />,
				flex: 1,
				sortable: false,
				resizable: true,
			},
			{
				headerName: 'Status',
				cellRenderer: (params: { data: EligibleRole }) => {
					const isActivated = isEligibleRoleActivated(params.data)
					const roleStatus = roleStatusQuery.data?.[params.data.accountId]

					if (isActivated && roleStatus?.endDateTime) {
						return (
							<Center>
								<ExpiresCountdown
									futureDate={roleStatus.endDateTime}
									active={true}
								/>
							</Center>
						)
					}

					return params.data.schedule.endDateTime ? (
						<Center>
							<ExpiresCountdown futureDate={params.data.schedule.endDateTime} />
						</Center>
					) : (
						<Center>
							<Text
								size="sm"
								style={{ textAlign: 'center' }}
								title="No expiration"
							>
								Permanent
							</Text>
						</Center>
					)
				},
				width: 100,
				sortable: false,
				resizable: true,
				valueGetter: params => params.data?.schedule.endDateTime || '',
				suppressColumnsToolPanel: true,
				lockVisible: true,
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
								disabled={isEligibleRoleNewlyActivated(params.data)}
								onClick={() => {
									handleActivateClick(params.data)
								}}
								loaderProps={{
									color: 'blue',
								}}
							>
								<Skeleton visible={!roleStatusQuery.isSuccess}>
									{isEligibleRoleActivated(params.data) ? (
										<IconPlayerStop
											size="sm"
											color={isEligibleRoleNewlyActivated(params.data) ? undefined : 'red'}
											title={
												isEligibleRoleNewlyActivated(params.data)
													? `Role must be active for at least 5 minutes before it can be disabled`
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
				width: 35,
				pinned: 'right',
				sortable: false,
				resizable: false,
			},
		],
		[roleStatusQuery.isSuccess, currentTab, isEligibleRoleActivated, isEligibleRoleNewlyActivated],
	)

	async function handleActivateClick(eligibleRole: EligibleRole) {
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
				const accountName = getAccountByLocalId(role.accountId).name?.toLowerCase() || ''
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

	/** Highlight roles that match the current resource in the active browser tab */
	const getRowStyle = (params: RowClassParams<EligibleRole>) => {
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
				p="lg"
				radius="md"
			>
				<Stack gap="md">
					<Group
						justify="space-between"
						align="center"
					>
						<Title
							order={3}
							c="white"
							fw={600}
						>
							Eligible Roles
						</Title>
						<Group gap="xs">
							<Button
								disabled={eligibleRolesQuery.isFetching}
								variant="subtle"
								color="green"
								size="compact-sm"
								onClick={refresh}
							>
								<IconRefresh />
							</Button>
							<Button
								variant="subtle"
								color="gray"
								size="compact-sm"
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

					<div style={{ height: 'calc(100vh - 200px)', width: '100%', position: 'relative', minHeight: '400px' }}>
						<MantineAgGridReact<EligibleRole>
							className="roleTable"
							loading={eligibleRolesQuery.isFetching}
							rowData={filteredRoles}
							columnDefs={columnDefs}
							getRowId={params => params.data.schedule.id}
							onGridReady={onGridReady}
							getRowStyle={getRowStyle}
							domLayout="normal"
							rowSelection={{ mode: 'singleRow', checkboxes: false }}
							animateRows={false}
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
						onSuccess={activatedRole => {
							closeActivationModal()
						}}
					/>
				)}
			</Modal>
		</>
	)
}

export default RoleTable
