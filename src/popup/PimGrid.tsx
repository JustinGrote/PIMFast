import { useState, useEffect } from 'react'
import { logout, getAllAccounts, getRoleEligibilitySchedules } from './auth'
import { AccountInfo } from '@azure/msal-browser'
import { RoleAssignmentSchedule, RoleAssignmentScheduleInstance } from '@azure/arm-authorization';

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
      {/* Logged In Accounts Card */}
      <div className="login-card">
        <h2>Logged In Accounts</h2>
        {accounts.length > 0 ? (
          <table className="accounts-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Tenant ID</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account, index) => (
                <tr key={index}>
                  <td>{account.name || 'N/A'}</td>
                  <td>{account.username}</td>
                  <td>{account.tenantId}</td>
                  <td>
                    <button
                      className="sign-out-button"
                      onClick={() => handleSignOutAccount(account)}
                      disabled={signingInAccount === account.homeAccountId}
                      title="Sign out this account"
                    >
                      {signingInAccount === account.homeAccountId ? (
                        <>
                          <div className="spinner"></div>
                        </>
                      ) : (
                        '❌'
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No accounts found.</p>
        )}
        <button
          className="logout-button"
          onClick={handleSignOut}
        >
          Sign Out All
        </button>
      </div>

      {/* Role Eligibility Schedules Grid - always below the accounts card */}
      <div className="role-schedules" style={{ marginTop: '2rem' }}>
        <h2>Eligible Roles</h2>
        {loadingRoles ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading role schedules...</p>
          </div>
        ) : roleSchedules.length > 0 ? (
          <table className="accounts-table">
            <thead>
              <tr>
                <th></th> {/* New checkbox column */}
                <th>ID</th>
                <th>Type</th>
                <th>Role</th>
                <th>Scope</th>
                <th>Status</th>
                <th>Start Time</th>
                <th>End Time</th>
              </tr>
            </thead>
            <tbody>
              {roleSchedules.map((schedule, index) => (
                <tr key={index}>
                  <td>
                    <input
                      type="checkbox"
                      checked={!!checkedRows[index]}
                      onChange={() =>
                        setCheckedRows(prev => ({
                          ...prev,
                          [index]: !prev[index]
                        }))
                      }
                    />
                    <button
                      style={{ marginLeft: 4 }}
                      type="button"
                      onClick={() => {/* TODO: handle activation logic here */}}
                    >
                      Activate
                    </button>
                  </td>
                  <td>{schedule.name}</td>
                  <td>{schedule.assignmentType}</td>
                  <td>{schedule.roleDefinitionId}</td>
                  <td>{schedule.scope || 'N/A'}</td>
                  <td>{schedule.status || 'N/A'}</td>
                  <td>
                    {schedule.startDateTime
                      ? schedule.startDateTime instanceof Date
                        ? schedule.startDateTime.toLocaleString()
                        : String(schedule.startDateTime)
                      : 'N/A'}
                  </td>
                  <td>
                    {schedule.endDateTime
                      ? schedule.endDateTime instanceof Date
                        ? schedule.endDateTime.toLocaleString()
                        : String(schedule.endDateTime)
                      : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No role eligibility schedules found.</p>
        )}
        <button
          className="refresh-button"
          onClick={loadRoleSchedules}
          disabled={loadingRoles}
        >
          {loadingRoles ? 'Refreshing...' : 'Refresh Roles'}
        </button>
      </div>
    </div>
  )
}
