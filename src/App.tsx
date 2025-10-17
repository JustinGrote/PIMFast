import { scopesGraphAndAzure, setMsalInstance } from '@/api/auth'
import AccountTable from '@/components/AccountTable'
import ErrorBoundary from '@/components/ErrorBoundary'
import { InteractionStatus } from '@azure/msal-browser'
import { AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react'
import { Button, Loader, Skeleton, Stack, Text } from '@mantine/core'
import { IconBrandAzure } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { Suspense } from 'react'
import './App.css'
import RoleTable from './components/RoleTable'
import PWABadge from './PWABadge'

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
						<RoleTable />
					</Stack>
				</AuthenticatedTemplate>

				<PWABadge />
			</ErrorBoundary>
		</>
	)
}

export default App
