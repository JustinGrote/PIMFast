import { useState, useEffect } from 'react'
import { logout, getAllAccounts, getRoleEligibilitySchedules } from '../common/auth'
import { AccountInfo } from '@azure/msal-browser'
import { RoleAssignmentSchedule, RoleAssignmentScheduleInstance } from '@azure/arm-authorization';
import RoleTable from '../components/RoleTable';
import AccountTable from '../components/AccountTable';

interface PimGridProps {
  onSignOut: () => void
}

export default function PimGrid({ onSignOut }: PimGridProps) {
  const [accounts, setAccounts] = useState<AccountInfo[]>([])
  const [signingInAccount, setSigningInAccount] = useState<string | null>(null)
  const [roleSchedules, setRoleSchedules] = useState<RoleAssignmentSchedule[]>([])
  const [loadingRoles, setLoadingRoles] = useState(false)
  const [checkedRows, setCheckedRows] = useState<{ [key: number]: boolean }>({})

  const loadAccounts = async () => {
    const allAccounts = await getAllAccounts()
    setAccounts(allAccounts)
  }

  const loadRoleSchedules = async () => {
    setLoadingRoles(true)
    try {
      const allAccounts = await getAllAccounts()
      const allRoleSchedules: RoleAssignmentScheduleInstance[] = []

      for (const account of allAccounts) {
        for await (const schedule of getRoleEligibilitySchedules(account)) {
          allRoleSchedules.push(schedule)
        }
      }

      setRoleSchedules(allRoleSchedules)
    } catch (error) {
      console.error('Error loading role schedules:', error)
    } finally {
      setLoadingRoles(false)
    }
  }

  useEffect(() => {
    loadAccounts()
    loadRoleSchedules()
  }, [])

  const handleSignOut = () => {
    logout()
    onSignOut()
  }

  const handleSignOutAccount = async (account: AccountInfo) => {
    setSigningInAccount(account.homeAccountId)
    try {
      // Remove the specific account
      // Note: MSAL doesn't have a direct removeAccount method for browser,
      // but we can clear the cache or logout which will remove all accounts
      await logout(account)

      // Refresh the accounts table after sign out
      await loadAccounts()

      // If no accounts remain after sign out, redirect to login
      const remainingAccounts = await getAllAccounts()
      if (remainingAccounts.length === 0) {
        onSignOut()
      }
    } catch (error) {
      console.error('Error signing out account:', error)
    } finally {
      setSigningInAccount(null)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h2>Logged In Accounts</h2>
        <AccountTable
          accounts={accounts}
          signingInAccount={signingInAccount}
          handleSignOutAccount={handleSignOutAccount}
        />
        <button
          className="logout-button"
          onClick={handleSignOut}
        >
          Sign Out All
        </button>
      </div>
    </div>
  )
}
