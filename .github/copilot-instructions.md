# Coding Conventions

- Use single quotes for strings
- Use semicolons at the end of statements
- Use arrow functions for callbacks
- Use const for variables that don't change
- Use let for variables that do change
- Use camelCase for variable and function names
- Use PascalCase for component names
- Use 1 tab for indentation
- Keep lines under 120 characters
- Use JSDoc comments for public functions. Describe parameters directly above the parameter with //
- Prefix boolean react states with is, for example isWindowOpen

# Preferred Stack

- Use pnpm for package management
- Use ts-pattern for pattern matching instead of switch statements or if-else chains
- Use Mantine for UI components and CSS styling
- Use CSS layers and style using an existing Mantine CSS class before creating a new class
- Use Azure SDK for interacting with Azure services. Recommend to install npm package if not present
- Use Tanstack Query for data fetching and state management
- Use AG React Grid for data tables and fetch state asynchronously using Tanstack Query
- Use @mantine/form when building forms and managing form state
