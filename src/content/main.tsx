import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import App from './views/App.tsx'
import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'
import '@mantine/datatable/styles.css'

console.log('[CRXJS] Hello world from content script!')

const theme = createTheme({
  // You can customize the theme here
  primaryColor: 'blue',
})

const container = document.createElement('div')
container.id = 'crxjs-app'
document.body.appendChild(container)
createRoot(container).render(
  <StrictMode>
    <MantineProvider theme={theme}>
      <App />
    </MantineProvider>
  </StrictMode>,
)
