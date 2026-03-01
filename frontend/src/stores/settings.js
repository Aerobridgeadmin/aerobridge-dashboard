import { defineStore } from 'pinia'
import { ref } from 'vue'
import { createResource } from 'frappe-ui'

export const useSettings = defineStore('settings', () => {
	const isSettingsOpen = ref(false)
	const isCommandPaletteOpen = ref(false)
	const activeTab = ref(null)

	const settings = createResource({
		url: 'aerobridge.aerobridge.api.get_aerobridge_settings',
		auto: true,
		cache: 'Aerobridge Settings',
	})

	const sidebarSettings = createResource({
		url: 'aerobridge.aerobridge.api.get_sidebar_settings',
		cache: 'Sidebar Settings',
		auto: false,
	})

	const programs = createResource({
		url: 'aerobridge.aerobridge.utils.get_programs',
		auto: false,
	})

	return {
		activeTab,
		isSettingsOpen,
		isCommandPaletteOpen,
		programs,
		settings,
		sidebarSettings,
	}
})
