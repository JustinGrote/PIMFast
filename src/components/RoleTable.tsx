import { getAzurePortalUrl } from '@/api/azureResourceId'
import { AzureResource } from '@/components/icons/AzureResource'
import { RoleActivationForm } from '@/components/RoleActivationForm'
import { useEligibleRoleLiveQuery } from '@/db/EligibleRole.db'
import { getRoleScheduleAccount, setRoleScheduleAccount } from '@/model/EligibleRole'
import { fromGraphSchedule, RoleSchedule } from '@/model/RoleSchedule'
import { useMsal } from '@azure/msal-react'
import { Button, Group, Modal, Skeleton, Stack, Text, TextInput, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconClearAll, IconRefresh, IconSearch } from '@tabler/icons-react'
import { EntraConnect, Groups, ManagementGroups, ResourceGroups, Subscriptions } from '@threeveloper/azure-react-icons'
import { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community'
import dayjs from 'dayjs'
import durationPlugin from 'dayjs/plugin/duration'
import relativeTimePlugin from 'dayjs/plugin/relativeTime'
import { memo, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { match } from 'ts-pattern'
import MantineAgGridReact from './MantineAgGridReact'
import { useQueryClient } from '@tanstack/react-query'
import RoleScope from './RoleScope'
import { throwError } from '@/api/util'
import ResolvedTenantName from './ResolvedTenantName'
import { createCollection, useLiveQuery } from '@tanstack/react-db'
import { getMyEntraRoleEligibilitySchedules } from '@/api/pimGraph'
import { queryCollectionOptions } from '@tanstack/query-db-collection'

dayjs.extend(durationPlugin)
dayjs.extend(relativeTimePlugin)

function RoleTable() {
	const [isActivationModalOpened, { open: openActivationModal, close: closeActivationModal }] = useDisclosure(false)
	const [selectedRole, setSelectedRole] = useState<RoleSchedule | null>(null)
	const [gridApi, setGridApi] = useState<GridApi<RoleSchedule> | null>(null)
	const [filterQuery, setFilterQuery] = useState('')

	const { accounts } = useMsal()
	const queryClient = useQueryClient()
	const accountsHash = accounts.map(a => a.homeAccountId).join('|')

	const eligibleRolesQuery = useEligibleRoleLiveQuery(accountsHash)

	// const {
	// 	accountIds,
	// 	eligibleRolesQuery,
	// 	// roleStatusQuery,
	// 	// deactivateEligibleRoleMutation,
	// 	refresh,
	// 	isEligibleRoleActivated,
	// 	isEligibleRoleNewlyActivated,
	// 	isEligibleRoleDeactivating,
	// } = useRoleTableQueries()

	// const handleActivateClick = useCallback(
	// 	(eligibleRole: RoleSchedule) => {
	// 		setSelectedRole(eligibleRole)
	// 		if (!isEligibleRoleActivated(eligibleRole)) {
	// 			openActivationModal()
	// 		} else {
	// 			deactivateEligibleRoleMutation.mutate(eligibleRole)
	// 		}
	// 	},
	// 	[deactivateEligibleRoleMutation, isEligibleRoleActivated, openActivationModal]
	// )
	// const renderStatusCell = useCallback(
	// 	(params: { data: RoleSchedule }) => {
	// 		const isActivated = isEligibleRoleActivated(params.data)
	// 		const roleStatus = roleStatusQuery.data?.[params.data.id]

	// 		if (isActivated && roleStatus?.endDateTime) {
	// 			return (
	// 				<Center style={{ width: '100%' }}>
	// 					<ExpiresCountdown
	// 						futureDate={roleStatus.endDateTime}
	// 						active={true}
	// 					/>
	// 				</Center>
	// 			)
	// 		}

	// 		return params.data.endDateTime ? (
	// 			<Center>
	// 				<ExpiresCountdown futureDate={params.data.endDateTime} />
	// 			</Center>
	// 		) : (
	// 			<Center>
	// 				<Text
	// 					size="sm"
	// 					style={{ textAlign: 'center' }}
	// 					title="No expiration"
	// 				>
	// 					Permanent
	// 				</Text>
	// 			</Center>
	// 		)
	// 	},
	// 	[isEligibleRoleActivated, roleStatusQuery.data]
	// )

	const columnDefs: ColDef<RoleSchedule>[] = useMemo(
		() => [
			{
				field: 'roleDefinitionDisplayName',
				headerName: 'Role',
				cellRenderer: (params: { data: RoleSchedule }) => (
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
				cellRenderer: memo(RoleScope),
				flex: 2,
				sortable: true,
				resizable: true,
				valueGetter: params => params.data?.scopeDisplayName || '',
			},
			{
				headerName: 'Account',
				cellRenderer: (params: { data: RoleSchedule }) => {
					const account = getRoleScheduleAccount(params.data)
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
				hide: accounts.length <= 1,
				valueGetter: params => {
					const account = params.data ? getRoleScheduleAccount(params.data) : undefined
					if (!account) {
						return ''
					}
					return account.name
				},
			},
			{
				headerName: 'Tenant',
				cellRenderer: (params: { data: RoleSchedule }) => {
					return (
						<Suspense fallback={<Skeleton>Fetching Tenant Info</Skeleton>}>
							<ResolvedTenantName
								role={params.data}
								account={
									getRoleScheduleAccount(params.data) ??
									throwError('Account not found in Role to Account Map. This is a bug')
								}
							/>
						</Suspense>
					)
				},
				flex: 1,
				sortable: false,
				resizable: true,
			},
			// {
			// 	headerName: 'Status',
			// 	cellRenderer: renderStatusCell,
			// 	width: 100,
			// 	sortable: false,
			// 	resizable: true,
			// 	valueGetter: params => params.data?.endDateTime || '',
			// 	suppressColumnsToolPanel: true,
			// 	lockVisible: true,
			// },
			// {
			// 	headerName: '',
			// 	headerComponent: () => (
			// 		<Center>
			// 			<IconClick size={16} />
			// 		</Center>
			// 	),
			// 	cellRenderer: (params: { data: RoleSchedule }) => (
			// 		<div className="one-line-row">
			// 			<Group>
			// 				<ActionIcon
			// 					variant="subtle"
			// 					disabled={isEligibleRoleNewlyActivated(params.data)}
			// 					onClick={() => {
			// 						handleActivateClick(params.data)
			// 					}}
			// 					loaderProps={{
			// 						color: 'blue',
			// 					}}
			// 				>
			// 					<Skeleton visible={!roleStatusQuery.isSuccess}>
			// 						{isEligibleRoleActivated(params.data) ? (
			// 							isEligibleRoleDeactivating(params.data) ? (
			// 								<Loader size="sm" />
			// 							) : (
			// 								<IconPlayerStop
			// 									size="sm"
			// 									color={isEligibleRoleNewlyActivated(params.data) ? undefined : 'red'}
			// 									title={
			// 										isEligibleRoleNewlyActivated(params.data)
			// 											? `Role must be active for at least 5 minutes before it can be disabled`
			// 											: 'Deactivate Role'
			// 									}
			// 								/>
			// 							)
			// 						) : (
			// 							<IconPlayerPlay
			// 								color="green"
			// 								title="Activate Role"
			// 							/>
			// 						)}
			// 					</Skeleton>
			// 				</ActionIcon>
			// 			</Group>
			// 		</div>
			// 	),
			// 	width: 35,
			// 	pinned: 'right',
			// 	sortable: false,
			// 	resizable: false,
			// },
		],
		[accounts]
	)

	// Filter the eligible roles based on search query
	const filteredRoles: RoleSchedule[] = (() => {
		const base = [...eligibleRolesQuery.data]
		if (!filterQuery) {
			return base
		}
		const lowerQuery = filterQuery.toLowerCase()
		return base.filter(role => {
			const account = getRoleScheduleAccount(role)
			const accountName = account?.name?.toLowerCase() || ''
			const roleName = role.roleDefinitionDisplayName?.toLowerCase() || ''
			const scopeName = role.scopeDisplayName?.toLowerCase() || ''
			// TODO: Fix tenant search

			return accountName.includes(lowerQuery) || roleName.includes(lowerQuery) || scopeName.includes(lowerQuery)
		})
	})()

	const onGridReady = (params: GridReadyEvent<RoleSchedule>) => {
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

	const resetView = () => {
		gridApi?.resetColumnState()
		gridApi?.resetQuickFilter()
	}

	// Re-render grid when loading or rowData changes
	const gridKey = `${eligibleRolesQuery.isLoading ? 'loading' : 'ready'}-${filteredRoles.map(r => r.id).join('|')}`

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
						<Button
							disabled={eligibleRolesQuery.isLoading}
							variant="subtle"
							color="green"
							size="compact-sm"
							// TODO: Centralize this behavior
							onClick={() => queryClient.invalidateQueries({ queryKey: ['pim'] })}
						>
							<IconRefresh />
						</Button>
						<Button
							variant="subtle"
							color="gray"
							size="compact-sm"
							onClick={resetView}
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

				<MantineAgGridReact<RoleSchedule>
					key={gridKey}
					className="roleTable"
					loading={eligibleRolesQuery.isLoading}
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
