import { getAzurePortalUrl } from '@/api/azureResourceId'
import { AzureResource } from '@/components/icons/AzureResource'
import { RoleActivationForm } from '@/components/RoleActivationForm'
import { CommonRoleSchedule } from '@/model/CommonRoleSchedule'
import { getCommonRoleScheduleAccount } from '@/model/EligibleRole'
import { ActionIcon, Button, Center, Group, Modal, Paper, Skeleton, Stack, Text, TextInput, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconClearAll, IconClick, IconPlayerPlay, IconPlayerStop, IconRefresh, IconSearch } from '@tabler/icons-react'
import { EntraConnect, Groups, ManagementGroups, ResourceGroups, Subscriptions } from '@threeveloper/azure-react-icons'
import { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community'
import dayjs from 'dayjs'
import durationPlugin from 'dayjs/plugin/duration'
import relativeTimePlugin from 'dayjs/plugin/relativeTime'
import { Suspense, useCallback, useMemo, useState } from 'react'
import { match } from 'ts-pattern'
import ExpiresCountdown from './ExpiresCountdown'
import MantineAgGridReact from './MantineAgGridReact'
import { ResolvedTenantName } from './ResolvedTenantName'
import { useRoleTableQueries } from './RoleTable.query'

dayjs.extend(durationPlugin)
dayjs.extend(relativeTimePlugin)

// FIXME: Handle if a tenant doesn't have P2 license

function RoleTable() {
	const [isActivationModalOpened, { open: openActivationModal, close: closeActivationModal }] = useDisclosure(false)
	const [selectedRole, setSelectedRole] = useState<CommonRoleSchedule | null>(null)
	const [gridApi, setGridApi] = useState<GridApi<CommonRoleSchedule> | null>(null)
	const [filterQuery, setFilterQuery] = useState('')

	const {
		accountIds,
		eligibleRoles,
		roleStatusQuery,
		deactivateEligibleRoleMutation,
		refresh,
		isEligibleRoleActivated,
		isEligibleRoleNewlyActivated,
	} = useRoleTableQueries()

	const handleActivateClick = useCallback(
		(eligibleRole: CommonRoleSchedule) => {
			setSelectedRole(eligibleRole)
			if (!isEligibleRoleActivated(eligibleRole)) {
				openActivationModal()
			} else {
				deactivateEligibleRoleMutation.mutate(eligibleRole)
			}
		},
		[deactivateEligibleRoleMutation, isEligibleRoleActivated, openActivationModal]
	)

	const columnDefs: ColDef<CommonRoleSchedule>[] = useMemo(
		() => [
			{
				field: 'roleDefinitionDisplayName',
				headerName: 'Role',
				cellRenderer: (params: { data: CommonRoleSchedule }) => (
					<div>
						<span title={params.data.roleDefinitionId || ''}>{params.data.roleDefinitionDisplayName ?? 'unknown'}</span>
					</div>
				),
				flex: 2,
				sortable: true,
				resizable: true,
			},
			{
				headerName: 'Scope',
				cellRenderer: (params: { data: CommonRoleSchedule }) => {
					const icon = match(params.data.scopeType)
						.with('resourcegroup', () => <ResourceGroups />)
						.with('subscription', () => <Subscriptions />)
						.with('managementgroup', () => <ManagementGroups />)
						.with('directory', () => <EntraConnect />)
						.with('group', () => <Groups />)
						.otherwise(() => <AzureResource />)
					const displayName = params.data.scopeDisplayName ?? 'unknown'
					const portalUrl = params.data.scope ? getAzurePortalUrl(params.data.scope, params.data.scopeType) : '#'

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
								title={params.data.scope ?? ''}
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
				valueGetter: params => params.data?.scopeDisplayName || '',
			},
			{
				headerName: 'Account',
				cellRenderer: (params: { data: CommonRoleSchedule }) => {
					const account = getCommonRoleScheduleAccount(params.data)
					if (!account) {
						return <Text size="sm">Unknown account</Text>
					}
					const { name, username } = account
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
					const account = params.data ? getCommonRoleScheduleAccount(params.data) : undefined
					if (!account) {
						return ''
					}
					return account.name
				},
			},
			{
				headerName: 'Tenant',
				cellRenderer: (params: { data: CommonRoleSchedule }) => {
					return (
						<Suspense fallback={<Skeleton>Fetching Tenant Info</Skeleton>}>
							<ResolvedTenantName role={params.data} />
						</Suspense>
					)
				},
				flex: 1,
				sortable: false,
				resizable: true,
			},
			{
				headerName: 'Status',
				cellRenderer: (params: { data: CommonRoleSchedule }) => {
					const isActivated = isEligibleRoleActivated(params.data)
					const roleStatus = roleStatusQuery.data?.[params.data.id]

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

					return params.data.endDateTime ? (
						<Center>
							<ExpiresCountdown futureDate={params.data.endDateTime} />
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
				valueGetter: params => params.data?.endDateTime || '',
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
				cellRenderer: (params: { data: CommonRoleSchedule }) => (
					<div className="one-line-row">
						<Group>
							<ActionIcon
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
		[
			accountIds.length,
			handleActivateClick,
			isEligibleRoleActivated,
			isEligibleRoleNewlyActivated,
			roleStatusQuery.data,
			roleStatusQuery.isSuccess,
		]
	)

	// Filter the eligible roles based on search query
	const filteredRoles = useMemo(() => {
		let filtered: CommonRoleSchedule[] = eligibleRoles

		// Apply search filter
		if (filterQuery) {
			const lowerQuery = filterQuery.toLowerCase()
			filtered = filtered.filter(role => {
				const account = getCommonRoleScheduleAccount(role)
				const accountName = account?.name?.toLowerCase() || ''
				const roleName = role.roleDefinitionDisplayName?.toLowerCase() || ''
				const scopeName = role.scopeDisplayName?.toLowerCase() || ''
				// TODO: Fix tenant search

				return (
					accountName.includes(lowerQuery) || roleName.includes(lowerQuery) || scopeName.includes(lowerQuery)
					// tenantName.includes(lowerQuery)
				)
			})
		}

		return filtered
	}, [filterQuery, eligibleRoles])

	const onGridReady = (params: GridReadyEvent<CommonRoleSchedule>) => {
		setGridApi(params.api)
	}

	// /** Highlight roles that match the current resource in the active browser tab */
	// const getRowStyle = (params: RowClassParams<EligibleRole>) => {
	// 	if (!currentTab?.url || !params.data) {
	// 		return undefined
	// 	}
	// 	try {
	// 		const resourceUri = getResourceIdFromPortalUrl(currentTab.url)
	// 		if (resourceUri.startsWith(params.data.schedule.scope!)) {
	// 			return { backgroundColor: 'var(--mantine-color-gray-7)' }
	// 		}
	// 	} catch (error: unknown) {
	// 		throwIfNotError(error)
	// 		console.debug(`Failed to find resource ID in ${currentTab.url}: ${error.message}`)
	// 	}
	// 	return undefined
	// }

	const resetColumnsOrder = () => {
		if (gridApi) {
			gridApi.resetColumnState()
		}
	}

	return (
		<>
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
						{/* FIXME: This breaks Tenant Refresh because the invalidate removes the account that tenantName depends on. */}
						{/* <Button
								disabled={eligibleRolesQuery.isLoading}
								variant="subtle"
								color="green"
								size="compact-sm"
								onClick={refresh}
							>
								<IconRefresh />
							</Button> */}
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

				<MantineAgGridReact<CommonRoleSchedule>
					className="roleTable"
					rowData={filteredRoles}
					columnDefs={columnDefs}
					getRowId={params => params.data.id}
					onGridReady={onGridReady}
					rowSelection={{ mode: 'singleRow', checkboxes: false }}
					animateRows={false}
					defaultColDef={{
						sortable: true,
						filter: true,
						resizable: true,
					}}
				/>
			</Stack>

			<Modal
				opened={isActivationModalOpened}
				onClose={closeActivationModal}
				title="Activate Role"
				size="lg"
			>
				{selectedRole && (
					<RoleActivationForm
						schedule={selectedRole}
						onSuccess={_activatedRole => {
							// TODO: Publish the activatedRole in a way that shows loading state until it's active
							closeActivationModal()
						}}
					/>
				)}
			</Modal>
		</>
	)
}

export default RoleTable
