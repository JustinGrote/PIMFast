import { getAllAccounts, logout } from '@/common/auth'
import { AccountInfo } from '@azure/msal-browser'
import { ActionIcon, Group, Text, Tooltip } from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import { DataTable } from 'mantine-datatable'
import { useEffect, useState } from 'react'

interface AccountTableProps {
	onNoAccounts?: () => void
}

export default function AccountTable({ onNoAccounts }: AccountTableProps) {
	const [accounts, setAccounts] = useState<AccountInfo[]>([])

	useEffect(() => {
		async function fetchAccounts() {
			const allAccounts = await getAllAccounts()
			setAccounts(allAccounts)
			if (allAccounts.length === 0 && onNoAccounts) {
				onNoAccounts()
			}
		}
		fetchAccounts()
	}, [onNoAccounts])

	async function handleSignOutAccount(account: AccountInfo) {
		console.log(`Signing out account: ${account.username}`)
		await logout(account)
		// Optionally, refresh the accounts list after sign out
		const allAccounts = await getAllAccounts()
		setAccounts(allAccounts)
		if (allAccounts.length === 0 && onNoAccounts) {
			onNoAccounts()
		}
	}

	return (
		<DataTable
			withTableBorder
			borderRadius="sm"
			withColumnBorders
			striped
			highlightOnHover
			records={accounts}
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
