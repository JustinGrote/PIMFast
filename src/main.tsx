import { getMilliseconds } from '@/api/time.ts';
import { Configuration, PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { MantineProvider, createTheme } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { scan } from 'react-scan'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

import '@mantine/core/styles.layer.css'
import '@mantine/dates/styles.layer.css'
import 'mantine-datatable/styles.layer.css'

// Enable React Scan in Dev only. {scan} import MUST be above react in the imports
scan({
	enabled: true,
})

const theme = createTheme({
	primaryColor: 'blue',
})

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: getMilliseconds(5, 'seconds'),
		},
	},
})

const msalConfiguration: Configuration = {
	auth: {
		clientId: '980df394-42ba-4a2c-919c-3e7609f3dbd1',
	},
	cache: {
		cacheLocation: 'localStorage',
	},
	system: {
		allowPlatformBroker: true,
		nativeBrokerHandshakeTimeout: 500,
	},
}

const client = new PublicClientApplication(msalConfiguration)

createRoot(document.getElementById('root')!).render(
	// <StrictMode>
	<MantineProvider
		defaultColorScheme="auto"
		theme={theme}
	>
		<MsalProvider instance={client}>
			<QueryClientProvider client={queryClient}>
				<App />
				<ReactQueryDevtools initialIsOpen={false} />
			</QueryClientProvider>
		</MsalProvider>
	</MantineProvider>
	// </StrictMode>
)
