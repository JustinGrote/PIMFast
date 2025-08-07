import RoleTable from '../components/RoleTable'
import { useState } from 'react'
import './App.css'
import { Container, Stack } from '@mantine/core'

export default function App() {
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const refreshData = () => {
    setRefreshTrigger(prev => prev + 1)
  }

  return (
    <Container py="md">
      <Stack>
        <RoleTable onRefresh={refreshData} />
      </Stack>
    </Container>
  )
}
