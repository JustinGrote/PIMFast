import { AccountInfoUniqueId, getAllAccounts, logout } from '@/api/auth'
import { AccountInfoDisplay } from '@/model/EligibleRole'
import { ActionIcon, Group, LoadingOverlay, Tooltip } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconX } from '@tabler/icons-react'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { ColDef } from 'ag-grid-community'
import { useMemo } from 'react'
import MantineAgGridReact from './MantineAgGridReact'
import ResolvedTenantName from './ResolvedTenantName'

export default function AccountTable() {
	const {
		data: accounts,
		isLoading,
		refetch,
	} = useSuspenseQuery<AccountInfoDisplay[]>({
		queryKey: ['pim', 'accounts'],
		queryFn: getAllAccounts,
		// We do this reduction to avoid unnecessary re-renders when the access token is updated. It's also private info we don't need to expose
		select: data =>
			data.map(account => ({
				name: account.name,
				username: account.username,
				tenantId: account.tenantId,
				homeAccountId: account.homeAccountId,
				localAccountId: account.localAccountId,
			})),
	})

	const { mutate: logoutAccount, isPending } = useMutation({
		mutationKey: ['signOut'],
		mutationFn: async (accountId: AccountInfoUniqueId) => {
			console.log(`Signing out account: ${accountId}`)
			await logout(accountId)
		},
		onSuccess: () => {
			refetch()
		},
		onError: error => {
			notifications.show({
				title: 'Sign Out Failed',
				message: `Failed to sign out account: ${error}`,
				color: 'red',
			})
		},
	})

	const handleSignOutAccount = (accountId: AccountInfoUniqueId) => logoutAccount(accountId)

	const columnDefs: ColDef<AccountInfoDisplay>[] = useMemo(
		() => [
			{
				field: 'name',
				headerName: 'Name',
				cellRenderer: (params: { value: string }) => params.value || 'N/A',
				flex: 1,
			},
			{
				field: 'username',
				headerName: 'Username',
				flex: 1,
			},
			{
				field: 'tenantId',
				headerName: 'Tenant ID',
				cellRenderer: (params: { data: AccountInfoDisplay }) => (
					<ResolvedTenantName
						account={params.data}
						roleOrTenantId={params.data.tenantId}
					/>
				),
				flex: 1,
			},
			{
				headerName: '',
				cellRenderer: (params: { data: AccountInfoDisplay }) => (
					<Group
						gap="xs"
						justify="flex-end"
					>
						<Tooltip label="Sign out">
							<ActionIcon
								color="red"
								variant="subtle"
								loading={isPending}
								onClick={() => handleSignOutAccount(params.data.localAccountId)}
							>
								<IconX size={16} />
							</ActionIcon>
						</Tooltip>
					</Group>
				),
				width: 80,
				pinned: 'right',
				sortable: false,
				filter: false,
			},
		],
		[isPending, handleSignOutAccount],
	)

	return (
		<div style={{ height: '400px', width: '100%', position: 'relative' }}>
			<LoadingOverlay
				visible={isLoading}
				zIndex={1000}
				overlayProps={{ radius: 'sm', blur: 2 }}
			/>
			<MantineAgGridReact
				rowData={accounts}
				columnDefs={columnDefs}
				loading={isLoading}
				getRowId={params => params.data.localAccountId}
				domLayout="autoHeight"
				suppressHorizontalScroll={false}
				rowSelection={{
					mode: 'singleRow',
				}}
			/>
		</div>
	)
}
