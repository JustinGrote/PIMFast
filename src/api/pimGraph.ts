import { AccountInfo } from '@azure/msal-browser';
import { AzureIdentityAuthenticationProvider } from '@microsoft/kiota-authentication-azure'
import { FetchRequestAdapter } from '@microsoft/kiota-http-fetchlibrary'
import { AccountInfoHomeId, AccountInfoTokenCredential, scopesGraphAndAzure } from './auth'
import { UnifiedRoleEligibilityScheduleInstance } from './generated/msgraph/models'
import { createPimGraphClient, PimGraphClient } from './generated/msgraph/pimGraphClient'

const graphPimClients: Record<AccountInfoHomeId, PimGraphClient> = {}

export function createPimClient(account: AccountInfo, scopes = scopesGraphAndAzure): PimGraphClient {
	try {
		const client = createPimGraphClient(
			new FetchRequestAdapter(new AzureIdentityAuthenticationProvider(new AccountInfoTokenCredential(account))),
		)
		return client
	} catch (error) {
		console.error('Error creating PIM Graph client:', error)
		throw error
	}
}

/** Returns a singleton global client, per best practice */
export function getPimClient(account: AccountInfo): PimGraphClient {
	const cacheKey = account.homeAccountId
	let client: PimGraphClient | undefined = graphPimClients[cacheKey]
	if (!client) {
		client = createPimClient(account)
		graphPimClients[cacheKey] = client
	}
	return client
}

export interface UnifiedRoleEligibilityScheduleInstanceExpanded extends UnifiedRoleEligibilityScheduleInstance {
	roleDefinition: {
		id: string
		displayName: string
		userPrincipalName: string
	}
	principal: {
		id: string
		displayName: string
		userPrincipalName: string
	}
}

/**
 * Retrieves the current user's role eligibility schedule instances from Microsoft Graph PIM.
 *
 * @param account - The Azure MSAL account information for authentication.
 * @returns A promise that resolves to an array of UnifiedRoleEligibilityScheduleInstance objects.
 * @throws Will throw an error if fetching fails.
 */
export async function getMyEntraRoleEligibilityScheduleInstances(
	account: AccountInfo,
): Promise<UnifiedRoleEligibilityScheduleInstanceExpanded[]> {
	try {
		const client = await getPimClient(account)

		const request =
			client.roleManagement.directory.roleEligibilityScheduleInstances.filterByCurrentUserWithOn('principal')
		const response = await request.get({
			queryParameters: {
				expand: ['roleDefinition', 'principal'],
			},
		})

		return (response?.value as UnifiedRoleEligibilityScheduleInstanceExpanded[]) ?? []
	} catch (error) {
		console.error('Error fetching role eligibility schedule instances:', error)
		throw error
	}
}
