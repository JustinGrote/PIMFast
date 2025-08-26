import { AccountInfo } from '@azure/msal-browser';
import {
	AccessTokenProvider,
	AllowedHostsValidator,
	BaseBearerTokenAuthenticationProvider,
} from '@microsoft/kiota-abstractions';
import { FetchRequestAdapter } from '@microsoft/kiota-http-fetchlibrary';
import { AccountInfoHomeId, AccountInfoTokenCredential, scopesGraphAndAzure } from './auth';
import { UnifiedRoleEligibilityScheduleInstance } from './generated/msgraph/models';
import { createPimGraphClient, PimGraphClient } from './generated/msgraph/pimGraphClient';

const graphPimClients: Map<AccountInfoHomeId, PimGraphClient> = new Map()

export async function createPimClient(account: AccountInfo, scopes = scopesGraphAndAzure): Promise<PimGraphClient> {
	const tokenCredential = new AccountInfoTokenCredential(account)
	// Adapt msal.js to kiota
	const accessTokenProvider: AccessTokenProvider = {
		getAuthorizationToken: async (): Promise<string> => {
			const token = await tokenCredential.getToken(scopes)
			if (!token) {
				throw new Error('No token returned from getToken')
			}
			return token.token
		},
		getAllowedHostsValidator: () => new AllowedHostsValidator(),
	}

	const client = createPimGraphClient(
		new FetchRequestAdapter(new BaseBearerTokenAuthenticationProvider(accessTokenProvider)),
	)
	return client
}

/** Returns a singleton global client, per best practice */
export async function getPimClient(account: AccountInfo): Promise<PimGraphClient> {
	const cacheKey = account.homeAccountId
	let client: PimGraphClient | undefined = graphPimClients.get(cacheKey)
	if (!client) {
		client = await createPimClient(account)
		graphPimClients.set(cacheKey, client)
	}
	return client
}

/**
 * Retrieves the current user's role eligibility schedule instances from Microsoft Graph PIM.
 *
 * @param account - The Azure MSAL account information for authentication.
 * @returns A promise that resolves to an array of UnifiedRoleEligibilityScheduleInstance objects.
 * @throws Will throw an error if fetching fails.
 */
export async function getMyRoleEligibilityScheduleInstances(
	account: AccountInfo,
): Promise<UnifiedRoleEligibilityScheduleInstance[]> {
	try {
		const client = await getPimClient(account)

		const request =
			client.roleManagement.directory.roleEligibilityScheduleInstances.filterByCurrentUserWithOn('principal')

		const response = await request.get()

		return response?.value ?? []
	} catch (error) {
		console.error('Error fetching role eligibility schedule instances:', error)
		throw error
	}
}
