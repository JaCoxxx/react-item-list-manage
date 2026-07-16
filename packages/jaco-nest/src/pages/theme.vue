<script setup lang="ts">
import type { ThemeName } from '@/stores/theme'

definePage({
  layout: 'blank',
})

const themeStore = useThemeStore()
const { currentTheme, themeClass } = storeToRefs(themeStore)
const { setTheme } = themeStore

const themeGroups = computed(() => [
  {
    title: '轻主题',
    description: '仅切换颜色体系，保留当前的圆角、阴影与布局节奏。',
    themes: themeList.filter(theme => theme.kind === 'light'),
  },
  {
    title: '古风重主题',
    description: '从水墨、朱砂和青玉中提取配色，并加入卷轴与印章般的形制。',
    themes: themeList.filter(theme => theme.kind === 'classic'),
  },
  {
    title: '道教风重主题',
    description: '以太极、八卦、云气与宣纸纹理构建安静而有秩序的东方视觉。',
    themes: themeList.filter(theme => theme.kind === 'taoist'),
  },
  {
    title: '科技风重主题',
    description: '用网格、光晕与高对比色塑造数字化界面质感。',
    themes: themeList.filter(theme => theme.kind === 'tech'),
  },
  {
    title: '创意重主题',
    description: '同时改变背景、表面质感、圆角和阴影，形成全新视觉语言。',
    themes: themeList.filter(theme => theme.kind === 'heavy'),
  },
])

function pick(name: ThemeName) {
  setTheme(name)
  uni.showToast({ icon: 'none', title: `已切换：${themeList.find(t => t.name === name)?.label}` })
}
</script>

<template>
  <view :class="['jn-page', themeClass]">
    <JnAppHeader title="主题切换" back-mode="auto" />

    <view class="px-[32rpx] py-[40rpx]">
      <text class="block mb-[24rpx] text-[26rpx] opacity-60">
        点击即时切换，无需刷新；当前主题会持久化保存。
      </text>

      <!-- 每个预览卡套自己的主题类，直接读取该主题的 --jn-preview-image。 -->
      <view v-for="group in themeGroups" :key="group.title" class="flex flex-col gap-[16rpx] mb-[36rpx]">
        <view>
          <text class="block text-[30rpx] font-bold jn-text-primary">{{ group.title }}</text>
          <text class="block mt-[6rpx] text-[24rpx] jn-text-tertiary">{{ group.description }}</text>
        </view>

        <view class="grid grid-cols-2 gap-[24rpx]">
          <view
            v-for="t in group.themes"
            :key="t.name"
            :class="`jn-theme-${t.name}`"
            class="aspect-square rounded-[20rpx] bg-cover bg-center relative overflow-hidden border-2 border-solid"
            :style="{
              backgroundImage: 'var(--jn-preview-image)',
              borderColor: currentTheme === t.name ? 'var(--jn-color-primary)' : 'transparent',
            }"
            @click="pick(t.name)"
          >
            <view class="absolute bottom-0 left-0 right-0 px-[20rpx] py-[16rpx]">
              <text class="text-[28rpx] font-bold jn-text-primary">
                {{ t.label }}
              </text>
            </view>
            <view
              v-if="currentTheme === t.name"
              class="absolute top-[12rpx] right-[12rpx] i-carbon-checkmark-filled text-[44rpx] jn-primary"
            />
          </view>
        </view>
      </view>
    </view>
  </view>
</template>
