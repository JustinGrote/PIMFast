import { Container, Stack } from '@mantine/core'
import { useEffect, useState } from 'react'
import RoleTable from '../components/RoleTable'
import './App.css'

export default function App() {
	const [_refreshTrigger, setRefreshTrigger] = useState(0)

	const refreshData = () => {
		setRefreshTrigger((prev) => prev + 1)
	}

	useEffect(() => {
		refreshData()
	}, [])

	return (
		<Container py="md">
			<Stack>
				<RoleTable onRefresh={refreshData} />
			</Stack>
		</Container>
	)
}
