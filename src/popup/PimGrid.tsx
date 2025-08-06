import { useState, useEffect } from 'react'
import { logout, getAllAccounts, getRoleEligibilitySchedules } from './auth'
import { AccountInfo } from '@azure/msal-browser'

interface PimGridProps {
  onSignOut: () => void
}

export default function PimGrid({ onSignOut }: PimGridProps) {
  const [accounts, setAccounts] = useState<AccountInfo[]>([])
  const [signingInAccount, setSigningInAccount] = useState<string | null>(null)
  const [roleSchedules, setRoleSchedules] = useState<any[]>([])
  const [loadingRoles, setLoadingRoles] = useState(false)

  const loadAccounts = async () => {
    const allAccounts = await getAllAccounts()
    setAccounts(allAccounts)
  }

  const loadRoleSchedules = async () => {
    setLoadingRoles(true)
    try {
      const allAccounts = await getAllAccounts()
      const allRoleSchedules = []

      for (const account of allAccounts) {
        const schedules = await getRoleEligibilitySchedules(account)
        for await (const schedule of schedules) {
          allRoleSchedules.push({
            accountUsername: account.username,
            ...schedule,
          })
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
      <div className="login-card" style={{ marginTop: '1rem' }}>
        <h2>Role Eligibility Schedules</h2>
        {loadingRoles ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading role schedules...</p>
          </div>
        ) : roleSchedules.length > 0 ? (
          <table className="accounts-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Subscription</th>
                <th>Role Definition</th>
                <th>Scope</th>
                <th>Status</th>
                <th>Start Time</th>
                <th>End Time</th>
              </tr>
            </thead>
            <tbody>
              {roleSchedules.map((schedule, index) => (
                <tr key={index}>
                  <td>{schedule.accountUsername}</td>
                  <td>{schedule.subscriptionName}</td>
                  <td>{schedule.properties?.expandedProperties?.roleDefinition?.displayName || schedule.properties?.roleDefinitionDisplayName || 'N/A'}</td>
                  <td>{schedule.properties?.expandedProperties?.scope?.displayName || schedule.properties?.scopeDisplayName || schedule.properties?.scope || 'N/A'}</td>
                  <td>
                    <span className={`status-badge ${schedule.properties?.status?.toLowerCase() || 'unknown'}`}>
                      {schedule.properties?.status || 'Unknown'}
                    </span>
                  </td>
                  <td>{schedule.properties?.startDateTime ? new Date(schedule.properties.startDateTime).toLocaleDateString() : 'N/A'}</td>
                  <td>{schedule.properties?.endDateTime ? new Date(schedule.properties.endDateTime).toLocaleDateString() : 'N/A'}</td>
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
