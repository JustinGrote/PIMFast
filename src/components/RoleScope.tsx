import { getAzurePortalUrl } from '@/api/azureResourceId'
import { RoleSchedule } from '@/model/RoleSchedule'
import { Group } from '@mantine/core'
import { ResourceGroups, Subscriptions, ManagementGroups, EntraConnect, Groups } from '@threeveloper/azure-react-icons'
import { match } from 'ts-pattern'
import { useMemo } from 'react'
import { AzureResource } from './icons/AzureResource'

/**
 * Component to display the scope of a role schedule with an appropriate icon and link to Azure Portal.
 */
export default function RoleScope(params: { data: RoleSchedule }) {
	return useMemo(() => {
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
	}, [params.data])
}
