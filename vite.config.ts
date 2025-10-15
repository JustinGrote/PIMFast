import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react-swc'
import path from 'node:path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
	build: {
		chunkSizeWarningLimit: 2048, // Matches PWA prefetch manifest limit
		rollupOptions: {
			output: {
				manualChunks: {
					generated: ['@/api/generated/msgraph/pimGraphClient'],
					'ag-grid': ['ag-grid-community', 'ag-grid-react'],
				},
			},
		},
	},
	plugins: [
		react(),
		// Fixes an error with vite and punycode, since we only use node for the build process
		nodePolyfills(),
		cloudflare(),
		VitePWA({
			registerType: 'prompt',
			injectRegister: false,
			pwaAssets: {
				image: 'public/pimfast.svg',
				injectThemeColor: true,
			},

			manifest: {
				name: 'PIM Fast',
				short_name: 'justingrote.pimfast',
				description: 'PIM Fast is a faster UI alternative for Azure Privileged Identity Management.',
				theme_color: '#242424',
			},

			workbox: {
				globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
				cleanupOutdatedCaches: true,
				clientsClaim: true,
			},

			devOptions: {
				enabled: false,
				navigateFallback: 'index.html',
				suppressWarnings: true,
				type: 'module',
			},
		}),
	],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
			'~': path.resolve(__dirname, './src'),
			'@@': path.resolve(__dirname, '.'),
			'~~': path.resolve(__dirname, '.'),
		},
	},
})