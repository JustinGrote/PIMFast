import { Subscription, SubscriptionClient } from "@azure/arm-subscriptions";
import { AccountInfoTokenCredential } from "./auth";
import { AccountInfo } from "@azure/msal-browser";


export async function* fetchSubscriptions(account: AccountInfo, forceRefresh = false): AsyncGenerator<Subscription> {
	const client = new SubscriptionClient(new AccountInfoTokenCredential(account));
	if (forceRefresh) {
		await chrome.storage.session.remove('subscriptions');
	}
	let subCache = await chrome.storage.session.get('subscriptions');
	if (!subCache.subscriptions) {
		subCache = { subscriptions: client.subscriptions.list() };
		chrome.storage.session.set(subCache)
	}
	yield* subCache.subscriptions;
}

export async function* fetchTenants(account: AccountInfo, forceRefresh = false): AsyncGenerator<Subscription> {
	const client = new SubscriptionClient(new AccountInfoTokenCredential(account));
	if (forceRefresh) {
		await chrome.storage.session.remove('tenants');
	}
	let subCache = await chrome.storage.session.get('tenants');
	if (!subCache.tenants) {
		subCache = { tenants: client.tenants.list() };
		chrome.storage.session.set(subCache)
	}
	yield* subCache.tenants;
}