import { Container, Stack } from '@mantine/core'
import RoleTable from '../components/RoleTable'
import './App.css'

export default function App() {
	return (
		<Container py="md">
			<Stack>
				<RoleTable />
			</Stack>
		</Container>
	)
}
