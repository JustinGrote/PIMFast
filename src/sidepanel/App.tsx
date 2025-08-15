import { Container, Stack } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import RoleTable from '../components/RoleTable'
import './App.css'

// This should probably move to individual panels
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 60 * 1000,
		},
	},
})

export default function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<Container py="md">
				<Stack>
					<RoleTable />
				</Stack>
			</Container>
			<ReactQueryDevtools initialIsOpen={false} />
		</QueryClientProvider>
	)
}
