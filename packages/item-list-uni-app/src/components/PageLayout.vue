<script setup lang="ts">
defineProps<{
	title: string;
	subtitle?: string;
}>();
</script>

<template>
	<view class="page-shell">
		<view class="page-stack">
			<view class="page-header">
				<text class="page-title">{{ title }}</text>
				<text v-if="subtitle" class="page-subtitle">{{ subtitle }}</text>
				<view v-if="$slots.actions" class="row-wrap">
					<slot name="actions" />
				</view>
			</view>
			<slot />
		</view>
	</view>
</template>
