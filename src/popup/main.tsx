import { MantineProvider, createTheme } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

import { getMilliseconds } from '@/common/time.ts'
import '@mantine/core/styles.layer.css'
import '@mantine/dates/styles.layer.css'
import 'mantine-datatable/styles.layer.css'
import './index.css'

const theme = createTheme({
	// You can customize the theme here
	primaryColor: 'blue',
})

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: getMilliseconds(1, 'minutes'),
		},
	},
})

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<MantineProvider
				defaultColorScheme="auto"
				theme={theme}
			>
				<App />
			</MantineProvider>
			<ReactQueryDevtools initialIsOpen={false} />
		</QueryClientProvider>
	</StrictMode>,
)
