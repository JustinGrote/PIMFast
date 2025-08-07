import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import App from './App.tsx'
import './index.css'
import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'
import 'mantine-datatable/styles.layer.css'

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
