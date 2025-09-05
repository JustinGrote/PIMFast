import { getAllAccounts, logout } from '@/api/auth'
import { AccountInfo } from '@azure/msal-browser'
import { ActionIcon, Group, LoadingOverlay, Tooltip } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconX } from '@tabler/icons-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ColDef } from 'ag-grid-community'
import { useMemo } from 'react'
import MantineAgGridReact from './MantineAgGridReact'
import ResolvedTenantName from './ResolvedTenantName'

export default function AccountTable() {
	const {
		data: accounts,
		isLoading,
		refetch,
	} = useQuery({
		queryKey: ['pim', 'accounts'],
		queryFn: getAllAccounts,
	})

	const { mutate: logoutAccount, isPending } = useMutation({
		mutationKey: ['signOut'],
		mutationFn: async (account: AccountInfo) => {
			console.log(`Signing out account: ${account.username}`)
			await logout(account)
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

	const handleSignOutAccount = (account: AccountInfo) => logoutAccount(account)

	const columnDefs: ColDef<AccountInfo>[] = useMemo(
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
				cellRenderer: (params: { data: AccountInfo }) => (
					<ResolvedTenantName
						account={params.data}
						roleOrTenantId={params.data.tenantId}
					/>
				),
				flex: 1,
			},
			{
				headerName: '',
				cellRenderer: (params: { data: AccountInfo }) => (
					<Group
						gap="xs"
						justify="flex-end"
					>
						<Tooltip label="Sign out">
							<ActionIcon
								color="red"
								variant="subtle"
								loading={isPending}
								onClick={() => handleSignOutAccount(params.data)}
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
				getRowId={params => params.data.homeAccountId}
				domLayout="autoHeight"
				suppressHorizontalScroll={false}
				rowSelection="single"
			/>
		</div>
	)
}
