import PWABadge from './PWABadge.tsx'
import './App.css'
import { useMsal } from '@azure/msal-react'
import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react'
import { scopesGraphAndAzure, setMsalInstance } from '@/api/auth.ts'
import AccountTable from '@/components/AccountTable.tsx'
import ErrorBoundary from '@/components/ErrorBoundary.tsx'
import { Text, Button, Stack, Loader, Skeleton } from '@mantine/core'
import { InteractionStatus } from '@azure/msal-browser'
import { IconBrandAzure } from '@tabler/icons-react'
import RoleTable from './components/RoleTable.tsx'
import { useQueryClient } from '@tanstack/react-query'
import { Suspense } from 'react'

function App() {
	const { instance, inProgress } = useMsal()
	const queryClient = useQueryClient()
	setMsalInstance(instance)
	return (
		<>
			<h1>PIM Fast</h1>

			<ErrorBoundary>
				<UnauthenticatedTemplate>
					<Stack>
						<Text>Please authenticate with your Azure account to continue.</Text>
						<Text
							size="xs"
							c="dimmed"
						>
							This extension requires Azure Management API access to manage your PIM roles.
						</Text>
					</Stack>
				</UnauthenticatedTemplate>
				<Button
					leftSection={
						inProgress === InteractionStatus.Login ? (
							<Loader
								color="white"
								size="xs"
							/>
						) : (
							<IconBrandAzure size={16} />
						)
					}
					disabled={inProgress === InteractionStatus.Login}
					onClick={() => {
						instance
							.loginPopup({
								scopes: scopesGraphAndAzure,
								prompt: 'select_account',
							})
							.then(() => {
								// Invalidate all queries to ensure fresh data after login
								queryClient.invalidateQueries()
							})
					}}
					variant="filled"
					color="blue"
				>
					{inProgress === InteractionStatus.Login ? 'Authenticating (continue in popup)' : 'Authenticate with Azure'}
				</Button>
				<p></p>
				<AuthenticatedTemplate>
					<Stack>
						<Suspense fallback={<Skeleton />}>
							<AccountTable />
						</Suspense>
						<Suspense fallback={<Skeleton />}>
							<RoleTable />
						</Suspense>
					</Stack>
				</AuthenticatedTemplate>

				<PWABadge />
			</ErrorBoundary>
		</>
	)
}

export default App
