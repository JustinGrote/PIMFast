import AccountTable from '@/components/AccountTable'
import { Alert, Button, Card, Container, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { IconAlertCircle, IconBrandAzure } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { checkIfAuthenticated, getChromeExtensionAzureToken } from '../common/auth'
import './App.css'

export default function App() {
	const [isLoading, setIsLoading] = useState(false)
	const [isAuthenticated, setIsAuthenticated] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// Check for existing valid token on component mount or when isAuthenticated changes
	useEffect(() => {
		const checkExistingAuth = async () => {
			setIsAuthenticated(await checkIfAuthenticated())
		}
		checkExistingAuth()
	}, [isAuthenticated])

	const handleAzureLogin = async () => {
		setIsLoading(true)
		setError(null)
		try {
			const authResult = await getChromeExtensionAzureToken()
			console.log('Authentication Result:', authResult)
			setIsAuthenticated(true)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Authentication failed')
			console.error('Azure authentication error:', err)
		} finally {
			setIsLoading(false)
		}
	}

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

					{error && (
						<Alert
							icon={<IconAlertCircle size={16} />}
							title="Authentication Error"
							color="red"
							variant="filled"
						>
							{error}
						</Alert>
					)}

					{isAuthenticated ? (
						<Stack>
							<AccountTable
								onNoAccounts={() => {
									setIsAuthenticated(false)
									setError(null)
								}}
							/>
							<div>Open the sidebar to see your PIM Roles</div>
						</Stack>
					) : (
						<Stack>
							<Text>Please authenticate with your Azure account to continue.</Text>
							<Button
								leftSection={<IconBrandAzure size={16} />}
								onClick={handleAzureLogin}
								disabled={isLoading}
								variant="filled"
								color="blue"
							>
								{isLoading ? (
									<Group gap="xs">
										<Loader
											color="white"
											size="xs"
										/>
										<span>Authenticating...</span>
									</Group>
								) : (
									'Authenticate with Azure'
								)}
							</Button>
							<Text
								size="xs"
								c="dimmed"
							>
								This extension requires Azure Management API access to manage your PIM roles.
							</Text>
						</Stack>
					)}
				</Stack>
			</Card>
		</Container>
	)
}
