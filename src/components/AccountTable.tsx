import { getAllAccounts, logout } from '@/common/auth';
import { AccountInfo } from '@azure/msal-browser'
import { useEffect, useState } from 'react'

interface AccountTableProps {
  onNoAccounts?: () => void;
}

export default function AccountTable({ onNoAccounts }: AccountTableProps) {
  const [accounts, setAccounts] = useState<AccountInfo[]>([])

  useEffect(() => {
    async function fetchAccounts() {
      const allAccounts = await getAllAccounts()
      setAccounts(allAccounts)
      if (allAccounts.length === 0 && onNoAccounts) {
        onNoAccounts()
      }
    }
    fetchAccounts()
  }, [onNoAccounts])

  return (
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
                onClick={async () => handleSignOutAccount(account)}
                title="Sign out this account"
              >❌</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  async function handleSignOutAccount(account: AccountInfo) {
    // This function should handle the sign-out logic for the specific account
    // For example, it could call a logout function from the auth module
    console.log(`Signing out account: ${account.username}`)
    await logout(account)
    // Optionally, refresh the accounts list after sign out
    const allAccounts = await getAllAccounts()
    setAccounts(allAccounts)
    if (allAccounts.length === 0 && onNoAccounts) {
      onNoAccounts()
    }
  }
}

