import Logo from '@/assets/crx.svg'
import { useState } from 'react'
import './App.css'
import { Button, Paper, Group, Title, Transition } from '@mantine/core'

function App() {
  const [show, setShow] = useState(false)
  const toggle = () => setShow(!show)

  return (
    <div className="popup-container">
      <Transition mounted={show} transition="fade" duration={400} timingFunction="ease">
        {(styles) => (
          <Paper
            shadow="md"
            p="md"
            withBorder
            style={{
              ...styles,
              position: 'absolute',
              bottom: '60px',
              right: '20px',
              zIndex: 1000,
            }}
          >
            <Group justify="center">
              <Title order={3}>PIM Fast</Title>
            </Group>
          </Paper>
        )}
      </Transition>
      <Button
        variant="filled"
        radius="xl"
        onClick={toggle}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '48px',
          height: '48px',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img src={Logo} alt="PIM Fast" width={24} height={24} />
      </Button>
    </div>
  )
}

export default App
