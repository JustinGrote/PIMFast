# PIMFast

PIMFast is a browser extension to ease the process of viewing and activating PIM Roles.

# Target Audience

PIM Power Users like MSPs who need to activate multiple roles frequently, often across different logged in accounts, or via Azure Lighthouse.

# Security

PIMFast is an [Azure Public Client App](https://learn.microsoft.com/en-us/entra/identity-platform/msal-client-applications), meaning that when you log in, your secrets or access credentials never leave your computer. PIMFast uses the [MSAL.js](https://github.com/AzureAD/microsoft-authentication-library-for-js) for token acquisition that stores them in an encrypted format to your local browser storage. No third party including myself has any access to your tokens, and any telemetry collection (currently disabled) santizes all tokens from transmission.

PIMFast has a default application principal for convenience which you can opt in, and only has rights to perform actions that you yourself have rights defined for. It does not require any kind of "admin" level grant. Currently this is the only supported option but the ability to supply your own custom application registration is forthcoming.

# Development

This project defines a type known as `EligibleRole` which includes both the account and the eligible role schedule instance. This is because we support multiple accounts, and there is a possible many-to-one relationship between accounts and eligible roles, so we need both for context.
