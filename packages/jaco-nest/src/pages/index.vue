<script setup lang="ts">
import type { HeaderAction } from '@/types/header'

definePage({
  type: 'home',
})

const actions: HeaderAction[] = [
  { text: '主题', onClick: () => uni.navigateTo({ url: '/pages/theme' }) },
  { text: '组件', onClick: () => uni.navigateTo({ url: '/pages/ui' }) },
  { text: '弹窗', onClick: () => uni.navigateTo({ url: '/pages/overlay' }) },
  { text: '关于', onClick: () => uni.showToast({ icon: 'none', title: 'jaco-nest + UnoCSS' }) },
  { text: '刷新', onClick: () => uni.showToast({ icon: 'none', title: '已刷新' }) },
]

// Pinia store 示例：状态用 storeToRefs 解包保持响应式，action 直接解构
const counter = useCounterStore()
const { count, double } = storeToRefs(counter)
const { inc, dec, reset } = counter
</script>

<template>
  <JnPageLayout title="jaco-nest" back-mode="none" :actions="actions">
    <view class="flex flex-col items-center gap-[40rpx] py-[80rpx]">
      <text class="text-[80rpx] font-bold jn-text-primary">
        {{ count }}
      </text>
      <text class="text-[24rpx] jn-text-tertiary">
        double = {{ double }}
      </text>
      <view class="flex gap-[24rpx]">
        <view class="jn-btn--secondary rounded-[12rpx] px-[48rpx] py-[16rpx] text-[32rpx]" @click="dec">
          -
        </view>
        <view class="jn-btn--primary rounded-[12rpx] px-[48rpx] py-[16rpx] text-[32rpx]" @click="inc">
          +
        </view>
      </view>
      <text class="text-[26rpx] jn-text-secondary" @click="reset">
        重置
      </text>
    </view>
  </JnPageLayout>
</template>
