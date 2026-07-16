<script setup lang="ts">
import type { HeaderAction, HeaderBackMode, HeaderTitleAlign } from '@/types/header'

const props = withDefaults(defineProps<{
  title?: string
  titleAlign?: HeaderTitleAlign
  backMode?: HeaderBackMode
  isListPage?: boolean
  homePath?: string
  actions?: HeaderAction[]
}>(), {
  title: '',
  titleAlign: 'center',
  backMode: 'auto',
  isListPage: false,
  homePath: '/pages/index',
  actions: () => [],
})

const {
  statusBarHeight,
  leftType,
  actionList,
  onBack,
  onHome,
} = useAppHeader(props)

const actionPopup = ref<{ open: (type?: string) => void, close: () => void }>()

function openActions() {
  actionPopup.value?.open('bottom')
}

function runAction(action: HeaderAction) {
  actionPopup.value?.close()
  action.onClick?.()
}
</script>

<template>
  <view
    class="sticky top-0 z-[1000] jn-bg-solid border-b border-b-1 jn-border"
    :style="{ paddingTop: `${statusBarHeight}px` }"
  >
    <view class="flex items-center h-[88rpx] px-[16rpx]">
      <view class="flex items-center min-w-[88rpx]">
        <view
          v-if="leftType === 'back'"
          class="header-icon-trigger px-[12rpx] py-[8rpx] rounded-[12rpx] active:opacity-60"
          @click="onBack"
        >
          <view class="i-carbon-arrow-left header-nav-icon jn-text-primary" />
        </view>
        <view
          v-else-if="leftType === 'home'"
          class="header-icon-trigger px-[12rpx] py-[8rpx] rounded-[12rpx] active:opacity-60"
          @click="onHome"
        >
          <view class="i-carbon-home header-nav-icon jn-text-primary" />
        </view>
      </view>

      <view
        class="flex-1 min-w-0"
        :class="{
          'text-left': titleAlign === 'left',
          'text-center': titleAlign === 'center',
          'text-right': titleAlign === 'right',
        }"
      >
        <text class="block text-[32rpx] font-bold jn-text-primary truncate">
          {{ title }}
        </text>
      </view>

      <view class="flex items-center justify-end min-w-[88rpx]">
        <view
          v-if="actionList.length"
          class="header-icon-trigger px-[12rpx] py-[8rpx] rounded-[12rpx] active:opacity-60"
          @click="openActions"
        >
          <view class="i-carbon-overflow-menu-horizontal header-menu-icon jn-text-primary" />
        </view>
      </view>
    </view>

    <uni-popup ref="actionPopup" type="bottom" background-color="var(--jn-color-surface-solid)">
      <view class="action-popup">
        <view
          v-for="action in actionList"
          :key="action.text"
          class="action-popup__item"
          @click="runAction(action)"
        >
          <text class="text-[30rpx] jn-text-primary">{{ action.text }}</text>
        </view>
      </view>
    </uni-popup>
  </view>
</template>

<style lang="scss" scoped>
.header-icon-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-nav-icon {
  width: 32rpx;
  height: 32rpx;
}

.header-menu-icon {
  width: 32rpx;
  height: 32rpx;
}

.action-popup {
  overflow: hidden;
  background: var(--jn-color-surface-solid);
  border: 1rpx solid var(--jn-color-border);
  border-bottom: 0;
  border-radius: var(--jn-radius-card) var(--jn-radius-card) 0 0;
}

.action-popup__item {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 96rpx;
  border-bottom: 1rpx solid var(--jn-color-divider);
}
</style>
