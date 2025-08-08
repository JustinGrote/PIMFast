import { useState, useEffect } from 'react'
import './App.css'
import { getChromeExtensionAzureToken, checkIfAuthenticated } from '../common/auth'
import AccountTable from '@/components/AccountTable'
import { Container, Card, Title, Text, Button, Stack, Group, Alert, Loader } from '@mantine/core'
import { IconAlertCircle, IconBrandAzure } from '@tabler/icons-react'

function openSidebar() {
	if (!window.chrome?.sidePanel) {
		alert('Sidebar API not available in this browser.')
	}
	window.chrome.sidePanel.open({ windowId: window.chrome.windows.WINDOW_ID_CURRENT })
}

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
		<Container size="sm" py="md">
			<Card shadow="sm" p="lg" radius="md" withBorder>
				<Stack>
					<Group justify="center">
						<Title order={1}>PIM Fast</Title>
					</Group>
					<Text c="dimmed" size="sm" ta="center">
						Azure Privileged Identity Management
					</Text>

					{error && (
						<Alert icon={<IconAlertCircle size={16} />} title="Authentication Error" color="red" variant="filled">
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
							<Button onClick={openSidebar} variant="filled" color="blue">
								Open Sidebar
							</Button>
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
										<Loader color="white" size="xs" />
										<span>Authenticating...</span>
									</Group>
								) : (
									'Authenticate with Azure'
								)}
							</Button>
							<Text size="xs" c="dimmed">
								This extension requires Azure Management API access to manage your PIM roles.
							</Text>
						</Stack>
					)}
				</Stack>
			</Card>
		</Container>
	)
}
