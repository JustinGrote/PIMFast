import { useState, useEffect } from 'react'
import './App.css'
import { getChromeExtensionAzureToken, checkIfAuthenticated } from './auth'
import PimGrid from './PimGrid'

export default function App() {
  const [isLoading, setIsLoading] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check for existing valid token on component mount
  useEffect(() => {
    const checkExistingAuth = async () => {
      setIsAuthenticated(
        await checkIfAuthenticated()
      )
    }
    checkExistingAuth()
  }, [])

  const handleAzureLogin = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const authResult = await getChromeExtensionAzureToken()
      console.log('Authentication Result:', authResult)
      setIsAuthenticated(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
      console.error('Azure authentication error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  if (isAuthenticated) {
    return <PimGrid onSignOut={() => setIsAuthenticated(false)} />
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="logo-section">
          <h1>PIM Fast</h1>
          <p>Azure Privileged Identity Management</p>
        </div>

        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="login-section">
          <p>Please authenticate with your Azure account to continue.</p>
          <button
            className={`azure-login-button ${isLoading ? 'loading' : ''}`}
            onClick={handleAzureLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <div className="spinner"></div>
                Authenticating...
              </>
            ) : (
              <>
                <svg className="microsoft-icon" viewBox="0 0 23 23" width="16" height="16">
                  <path fill="#f35325" d="M0 0h11v11H0z"/>
                  <path fill="#81bc06" d="M12 0h11v11H12z"/>
                  <path fill="#05a6f0" d="M0 12h11v11H0z"/>
                  <path fill="#ffba08" d="M12 12h11v11H12z"/>
                </svg>
                Authenticate with Azure
              </>
            )}
          </button>
        </div>

        <div className="info-section">
          <small>
            This extension requires Azure Management API access to manage your PIM roles.
          </small>
        </div>
      </div>
    </div>
  )
}
