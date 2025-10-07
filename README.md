# PIMFast

PIMFast is a browser extension to ease the process of viewing and activating PIM Roles.

## Target Audience

PIM Power Users like MSPs who need to activate multiple roles frequently, often across different logged in accounts, or via Azure Lighthouse.

## Security

PIMFast is an [Azure Public Client App](https://learn.microsoft.com/en-us/entra/identity-platform/msal-client-applications), meaning that when you log in, your secrets or access credentials never leave your computer. PIMFast uses the [MSAL.js](https://github.com/AzureAD/microsoft-authentication-library-for-js) for token acquisition that stores them in an encrypted format to your local browser storage. No third party including myself has any access to your tokens, and any telemetry collection (currently disabled) sanitizes all tokens from transmission.

PIMFast has a default application principal for convenience which you can opt in, and only has rights to perform actions that you yourself have rights defined for. It does not require any kind of "admin" level grant. Currently this is the only supported option but the ability to supply your own custom application registration is forthcoming.

## Development and Nonstandard Terminology

This project defines a type known as `EligibleRole` which includes both the account and the eligible role schedule instance. This is because we support multiple accounts, and there is a possible many-to-one relationship between accounts and eligible roles, so we need both for context.

## PIM API Concepts and Behavior

### Azure Resource Manager (ARM) PIM API

1. Schedules and schedule instances generally have the same common set of properties, other than linkages and dates such as `createdOn` and `expiration`.
1. The PIM API is primarily accessed via the Azure REST API endpoints under `/providers/Microsoft.Authorization/`.

#### Role Eligibility

1. A **role eligibility schedule** defines when a role can be activated for a user or principal. As of today, recurrence is not implemented, so there is always a 1:1 relationship between a schedule and its schedule instance.
1. Schedule queries also include unactivated future roles, so querying schedules is more useful than querying schedule instances. However, schedule instances represent the currently active eligible items and are useful for verifying active status.
1. A schedule is instantiated/created by a **schedule request**.
1. A **role eligibility schedule instance** is mapped to its schedule via the `roleEligibilityScheduleId` property.
1. A **role eligibility schedule** is mapped to its request via the `roleEligibilityScheduleRequestId` property, and vice-versa, a request is mapped to a schedule via the `targetRoleEligibilityScheduleId` property (1:1 mapping).
1. Eligible roles can be assigned at various scopes (management group, subscription, resource group, or resource).

#### Role Assignment

1. A **role assignment schedule** defines the active or future roles a user has.
1. A role assignment schedule might be linked to a **role assignment schedule request**. If it is not, the permission was assigned outside of PIM, for instance via direct IAM assignment.
1. A role assignment schedule might have a `linkedRoleEligibilityScheduleId`. If it does, then it was activated based on an eligibility schedule, either via self-activation by the user or activation by an admin.
1. A **role assignment schedule instance** defines the current roles a user has. There is a 1:1 relationship with schedules via the `roleAssignmentScheduleId` property. Unlike the eligible equivalent, however, there is no property the other direction, linking a schedule to a schedule instance. It also has the `linkedRoleEligibilityScheduleId`.
1. Assignment schedules and instances can be queried to determine which roles are currently active, scheduled for future activation, or eligible for activation.

#### Additional Notes

- PIMFast uses the Azure REST API for all PIM operations, including listing eligible roles, activating roles, and viewing assignment history.
- The extension supports multiple accounts and tenants, and can display roles across all accessible scopes.
- For more information on the PIM API, see the [Azure REST API documentation](https://learn.microsoft.com/en-us/rest/api/authorization/).
