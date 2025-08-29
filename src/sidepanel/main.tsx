import { MantineProvider, createTheme } from '@mantine/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

import '@mantine/core/styles.layer.css'
import '@mantine/dates/styles.layer.css'
import './index.css'

// Azure Portal-inspired theme
const theme = createTheme({
	primaryColor: 'azure',
	defaultRadius: 'sm',
	fontFamily: '"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
	fontSizes: {
		xs: '0.75rem',
		sm: '0.8rem',
		md: '1rem',
		lg: '1.125rem',
		xl: '1.25rem',
	},
	headings: {
		fontFamily: '"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
		fontWeight: '600',
		sizes: {
			h1: { fontSize: '2rem' },
			h2: { fontSize: '1.5rem' },
			h3: { fontSize: '1.25rem' },
			h4: { fontSize: '1.125rem' },
		},
	},
	colors: {
		azure: [
			'#e1f5fe',
			'#b3e5fc',
			'#81d4fa',
			'#4fc3f7',
			'#29b6f6',
			'#0078d4', // Azure primary blue
			'#0066b2',
			'#005a9e',
			'#004578',
			'#003d5b',
		],
		dark: [
			'#f8f9fa',
			'#e9ecef',
			'#adb5bd',
			'#6c757d',
			'#495057',
			'#343a40',
			'#2d2d30', // Azure Portal card background
			'#252526', // Azure Portal secondary background
			'#1e1e1e', // Azure Portal main background
			'#181818', // Azure Portal deepest background
		],
	},
	other: {
		azureBlue: '#0078d4',
		azureHeader: '#106ebe',
		textPrimary: '#ffffff',
		textSecondary: '#cccccc',
		textMuted: '#969696',
		borderColor: '#3c3c3c',
	},
})

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<MantineProvider
			defaultColorScheme="dark"
			theme={theme}
		>
			<App />
		</MantineProvider>
	</StrictMode>,
)
