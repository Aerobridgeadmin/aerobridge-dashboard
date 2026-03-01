<template>
	<Dialog
		v-model="show"
		:options="{
			size: '4xl',
			title: title,
		}"
	>
		<template #body-content>
			<div>
				<VideoBlock :file="file" />
			</div>
		</template>
	</Dialog>
</template>
<script setup>
import { Dialog } from 'frappe-ui'
import { computed } from 'vue'
import VideoBlock from '@/components/VideoBlock.vue'

const show = defineModel()

const props = defineProps({
	type: {
		type: [String, null],
		required: true,
	},
	title: {
		type: [String, null],
		required: true,
	},
})

const file = computed(() => {
	if (props.type == 'youtube') return '/assets/aerobridge/frontend/Youtube.mp4'
	if (props.type == 'quiz') return '/assets/aerobridge/frontend/Quiz.mp4'
	if (props.type == 'upload') return '/assets/aerobridge/frontend/Upload.mp4'
	if (props.type == 'remove') return '/assets/aerobridge/frontend/Remove.mp4'
})
</script>
