import RoleTable from '../components/RoleTable'
import { useState } from 'react'
import { RoleAssignmentScheduleInstance } from '@azure/arm-authorization'
import './App.css'

export default function App() {
  // Placeholder state for demonstration
  const [roleSchedules, setRoleSchedules] = useState<RoleAssignmentScheduleInstance[]>([])
  const [loadingRoles, setLoadingRoles] = useState(false)
  const [checkedRows, setCheckedRows] = useState<{ [key: number]: boolean }>({})

  return (
    <div>
      <RoleTable
        roleSchedules={roleSchedules}
        loadingRoles={loadingRoles}
        checkedRows={checkedRows}
        setCheckedRows={setCheckedRows}
        onRefresh={() => {}}
      />
    </div>
  )
}
