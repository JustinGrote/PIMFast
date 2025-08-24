import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

export default defineManifest({
	manifest_version: 3,
	name: pkg.title,
	description: pkg.title,
	version: pkg.version,
	permissions: ['sidePanel', 'contentSettings', 'identity', 'storage', 'offscreen'],
	host_permissions: ['https://portal.azure.com/*', 'ws://localhost/*'],
	icons: {
		48: 'public/logo.png',
	},
	action: {
		default_icon: {
			48: 'public/logo.png',
		},
		default_popup: 'src/popup/index.html',
	},
	side_panel: {
		default_path: 'src/sidepanel/index.html',
	},
	content_scripts: [
		{
			js: ['src/content/main.tsx'],
			matches: ['https://*/*'],
		},
	],
})
