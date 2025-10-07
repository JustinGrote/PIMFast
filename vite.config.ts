import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'node:path'

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react(),
		VitePWA({
			registerType: 'autoUpdate',
			injectRegister: false,

			pwaAssets: {
				disabled: false,
				config: true,
			},

			manifest: {
				name: 'PIM Fast',
				short_name: 'justingrote.pimfast',
				description: 'PIM Fast is a faster UI alternative for Azure Privileged Identity Management.',
				theme_color: '#ffffff',
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