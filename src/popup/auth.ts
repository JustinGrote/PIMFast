// Azure authentication logic with PKCE for Chrome Extensions

export async function authenticateWithAzure(): Promise<{ accessToken: string, refreshToken: string, expiresIn: number }> {
  const client_id = '980df394-42ba-4a2c-919c-3e7609f3dbd1'
  const redirectUri = chrome.identity.getRedirectURL()

  // PKCE helpers
  function base64UrlEncode(arrayBuffer: ArrayBuffer): string {
    let binary = ''
    const bytes = new Uint8Array(arrayBuffer)
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  }

  async function generateCodeChallenge(codeVerifier: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(codeVerifier)
    const digest = await window.crypto.subtle.digest('SHA-256', data)
    return base64UrlEncode(digest)
  }

  function generateCodeVerifier(length = 64): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
    let verifier = ''
    const randomValues = new Uint8Array(length)
    window.crypto.getRandomValues(randomValues)
    for (let i = 0; i < length; i++) {
      verifier += chars.charAt(randomValues[i] % chars.length)
    }
    return verifier
  }

  // PKCE: generate code verifier and challenge
  const codeVerifier: string = generateCodeVerifier(64)
  const codeChallenge: string = await generateCodeChallenge(codeVerifier)

  // Azure Authorization Code Flow with PKCE - Step 1: Get authorization code
  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
    `client_id=${client_id}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=${encodeURIComponent('https://management.azure.com/.default offline_access')}&` +
    `response_mode=query&` +
    `state=${encodeURIComponent(crypto.randomUUID())}&` +
    `code_challenge=${codeChallenge}&` +
    `code_challenge_method=S256`

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true
  })

  if (!responseUrl) {
    throw new Error('Authentication was cancelled or failed')
  }

  // Extract authorization code from the URL query parameters
  const url = new URL(responseUrl)
  const authCode = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const error_description = url.searchParams.get('error_description')

  if (error) {
    throw new Error(`Authentication error: ${error} - ${error_description}`)
  }

  if (!authCode) {
    throw new Error('No authorization code received')
  }

  // Step 2: Exchange authorization code for access token (with PKCE)
  const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: client_id,
      scope: 'https://management.azure.com/.default offline_access',
      code: authCode,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }),
  })

  if (!tokenResponse.ok) {
    const errorData = await tokenResponse.json()
    throw new Error(`Token exchange failed: ${errorData.error_description || errorData.error}`)
  }

  const tokenData = await tokenResponse.json()
  const accessToken = tokenData.access_token
  const refreshToken = tokenData.refresh_token
  const expiresIn = tokenData.expires_in

  if (!accessToken) {
    throw new Error('No access token received from token exchange')
  }

  return { accessToken, refreshToken, expiresIn }
}
