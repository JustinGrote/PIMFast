import { ManagementGroupsAPI } from '@azure/arm-managementgroups'
import { AccountInfo } from '@azure/msal-browser'
import { AccountInfoHomeId, AccountInfoTokenCredential } from './auth'

// Add a cache for management-groups clients
const managementGroupClients: Map<AccountInfoHomeId, ManagementGroupsAPI> = new Map()

/** Returns a singleton Management Groups client per account. **/
export function getMgClient(account: AccountInfo): ManagementGroupsAPI {
	const cacheKey = account.homeAccountId
	let client = managementGroupClients.get(cacheKey)
	if (!client) {
		client = new ManagementGroupsAPI(new AccountInfoTokenCredential(account))
		managementGroupClients.set(cacheKey, client)
	}
	return client
}

export const fetchManagementGroup = (account: AccountInfo, id: string) => getMgClient(account).managementGroups.get(id)
