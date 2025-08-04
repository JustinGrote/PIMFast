# Azure Authentication Setup

## Important Configuration Required

The login functionality uses OAuth 2.0 Authorization Code Flow and requires an Azure App Registration. The client ID `980df394-42ba-4a2c-919c-3e7609f3dbd1` is already configured in the code.

## Steps to set up Azure App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to "Azure Active Directory" > "App registrations"
3. Click "New registration"
4. Configure:
   - Name: "PIM Fast Extension"
   - Supported account types: "Accounts in any organizational directory"
   - Redirect URI: Leave blank for now (will be configured later)
5. After creation, note the "Application (client) ID"
6. Go to "Authentication" tab and add:
   - Platform: "Single-page application"
   - Redirect URI: Use the Chrome extension redirect URL (format: `chrome-extension://[extension-id]/`)
7. In "API Permissions", add:
   - Microsoft Graph: Directory.Read.All (for reading directory)
   - Azure Service Management: user_impersonation (for Azure Management API)
8. Grant admin consent for the permissions

## Authorization Code Flow Benefits

- **More Secure**: Access tokens are not exposed in URLs
- **Refresh Tokens**: Automatic token renewal without re-authentication
- **Better Error Handling**: Clearer error responses
- **PKCE Support**: Can be enhanced with PKCE for additional security

## Security Notes

- Uses Authorization Code Flow instead of implicit flow for better security
- Access and refresh tokens are stored in chrome.storage.local
- Tokens include expiry information for automatic refresh
- Proper error handling for token exchange failures
- State parameter included for CSRF protection
