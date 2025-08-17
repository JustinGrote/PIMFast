import AccountTable from '@/components/AccountTable'
import { Alert, Button, Card, Container, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { IconAlertCircle, IconBrandAzure } from '@tabler/icons-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { hasAuthenticatedAccounts, login } from '../common/auth'

import './App.css'

export default function App() {
	const [isAuthenticated, setIsAuthenticated] = useState(hasAuthenticatedAccounts)
	const queryClient = useQueryClient()

	const {
		error: authError,
		isPending: isAuthPending,
		mutate: onAuthenticateClick,
	} = useMutation({
		mutationFn: login,
		onSuccess: () => {
			setIsAuthenticated(hasAuthenticatedAccounts)
			// This is used in the AccountTable which will trigger an update
			queryClient.invalidateQueries({ queryKey: ['accounts'] })
		},
	})

	return (
		<Container
			size="sm"
			py="md"
		>
			<Card
				shadow="sm"
				p="lg"
				radius="md"
				withBorder
			>
				<Stack>
					<Group justify="center">
						<Title order={1}>PIM Fast</Title>
					</Group>
					<Text
						c="dimmed"
						size="sm"
						ta="center"
					>
						Azure Privileged Identity Management
					</Text>

					{isAuthenticated ? (
						<Stack>
							<AccountTable />
							<div>Open the sidebar to see your PIM Roles</div>
						</Stack>
					) : (
						<Stack>
							<Text>Please authenticate with your Azure account to continue.</Text>
							<Text
								size="xs"
								c="dimmed"
							>
								This extension requires Azure Management API access to manage your PIM roles.
							</Text>
						</Stack>
					)}
					<Button
						leftSection={
							isAuthPending ? (
								<Loader
									color="white"
									size="xs"
								/>
							) : (
								<IconBrandAzure size={16} />
							)
						}
						disabled={isAuthPending}
						onClick={() => onAuthenticateClick()}
						variant="filled"
						color="blue"
					>
						{isAuthPending ? 'Authenticating (continue in popup)' : 'Authenticate with Azure'}
					</Button>
					{authError && (
						<Alert
							icon={<IconAlertCircle size={16} />}
							title="Authentication Error"
							color="red"
							variant="filled"
						>
							{authError instanceof Error ? authError.message : 'Authentication failed'}
						</Alert>
					)}
				</Stack>
			</Card>
		</Container>
	)
}
