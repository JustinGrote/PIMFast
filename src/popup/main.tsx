import { MantineProvider, createTheme } from '@mantine/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

import '@mantine/core/styles.layer.css'
import '@mantine/dates/styles.layer.css'
import 'mantine-datatable/styles.layer.css'
import './index.css'

const theme = createTheme({
	// You can customize the theme here
	primaryColor: 'blue',
})

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<MantineProvider defaultColorScheme="auto" theme={theme}>
			<App />
		</MantineProvider>
	</StrictMode>,
)
