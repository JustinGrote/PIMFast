import { useComputedColorScheme } from '@mantine/core'
import { AllCommunityModule, colorSchemeDark, colorSchemeLight, ModuleRegistry, themeBalham } from 'ag-grid-community'
import { AgGridReact, AgGridReactProps } from 'ag-grid-react'
import { useMemo } from 'react'



// Register all Community features
ModuleRegistry.registerModules([AllCommunityModule])

/**
 * A pre-themed AG Grid React component that automatically integrates with the current Mantine theme.
 * Switches between light and dark themes based on the Mantine color scheme.
 */
export default function MantineAgGridReact({ ...agGridProps }: AgGridReactProps) {
	const currentColorScheme = useComputedColorScheme()

	// Determine the AG Grid theme class based on the Mantine color scheme
	const gridTheme = useMemo(() => {
		const baseTheme = themeBalham
		return currentColorScheme === 'light' ? baseTheme.withPart(colorSchemeLight) : baseTheme.withPart(colorSchemeDark)
	}, [currentColorScheme])

	// Merge default styling with user props
	const defaultGridOptions = useMemo(
		() => ({
			theme: gridTheme,
			// Apply Mantine's primary color as the selection color
			...agGridProps,
		}),
		[agGridProps],
	)

	return <AgGridReact {...defaultGridOptions} />
}
