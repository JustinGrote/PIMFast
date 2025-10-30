import { ActionIcon, Group, Tooltip } from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import { ColDef } from 'ag-grid-community'
import { useMemo } from 'react'
import MantineAgGridReact from './MantineAgGridReact'
import { useMsal } from '@azure/msal-react';
import { AccountInfo } from '@azure/msal-browser';

export default function AccountTable() {
	const { instance, accounts } = useMsal();
	const columnDefs: ColDef<AccountInfo>[] = [
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
			headerName: 'Tenant',
			// cellRenderer: (params: { data: AccountInfoDisplay }) => (
			// 	<ResolvedTenantName
			// 		role={{
			// 			accountId: params.data.localAccountId,
			// 		}}
			// 	/>
			// ),
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
							onClick={() =>
								instance.logoutRedirect({
									account: params.data,
									// BUG: MSAL is flushing all accounts incorrectly, so we just do a local logout here
									onRedirectNavigate: () => false,
								})
							}
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
	]

	return (
		<MantineAgGridReact
			className="accountTable"
			rowData={accounts}
			columnDefs={columnDefs}
			getRowId={params => params.data.localAccountId}
			suppressHorizontalScroll={false}
		/>
	)
}
