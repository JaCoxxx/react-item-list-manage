<script setup lang="ts">
import type { HeaderAction, HeaderBackMode, HeaderTitleAlign } from '@/types/header'

withDefaults(defineProps<{
  title?: string
  titleAlign?: HeaderTitleAlign
  showHeader?: boolean
  backMode?: HeaderBackMode
  isListPage?: boolean
  homePath?: string
  actions?: HeaderAction[]
}>(), {
  title: '',
  titleAlign: 'center',
  showHeader: true,
  backMode: 'auto',
  isListPage: false,
  homePath: '/pages/index',
  actions: () => [],
})

const { themeClass } = storeToRefs(useThemeStore())
// 自定义导航栏下，不显示 header 时仍需为状态栏留出安全区
const statusBarHeight = getStatusBarHeight()
</script>

<template>
  <view :class="['jn-page', themeClass]">
    <JnAppHeader
      v-if="showHeader"
      :title="title"
      :title-align="titleAlign"
      :back-mode="backMode"
      :is-list-page="isListPage"
      :home-path="homePath"
      :actions="actions"
    />
    <view class="p-[24rpx]" :style="showHeader ? undefined : { paddingTop: `${statusBarHeight}px` }">
      <view class="flex flex-col gap-[20rpx]">
        <slot />
      </view>
    </view>
  </view>
</template>
