import { getAllAccounts, logout } from '@/common/auth'
import { AccountInfo } from '@azure/msal-browser'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { ActionIcon, Group, Text, Tooltip } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconX } from '@tabler/icons-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { DataTable } from 'mantine-datatable'

export default function AccountTable() {
	const [bodyRef] = useAutoAnimate<HTMLTableSectionElement>()

	const {
		data: accounts = [],
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

	return (
		<DataTable
			withTableBorder
			borderRadius="sm"
			withColumnBorders
			striped
			highlightOnHover
			pinLastColumn
			records={accounts}
			idAccessor="homeAccountId"
			fetching={isLoading}
			bodyRef={bodyRef}
			columns={[
				{
					accessor: 'name',
					title: 'Name',
					render: (account: AccountInfo) => <Text>{account.name || 'N/A'}</Text>,
				},
				{
					accessor: 'username',
					title: 'Username',
				},
				{
					accessor: 'tenantId',
					title: 'Tenant ID',
				},
				{
					accessor: 'actions',
					title: '',
					textAlign: 'right',
					render: (account: AccountInfo) => (
						<Group
							gap="xs"
							justify="flex-end"
						>
							<Tooltip label="Sign out">
								<ActionIcon
									color="red"
									variant="subtle"
									loading={isPending}
									onClick={() => handleSignOutAccount(account)}
								>
									<IconX size={16} />
								</ActionIcon>
							</Tooltip>
						</Group>
					),
				},
			]}
		/>
	)
}
