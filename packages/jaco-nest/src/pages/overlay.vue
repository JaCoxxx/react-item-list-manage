<script setup lang="ts">
definePage({
  layout: 'default',
})

type MaskStyle = 'none' | 'dim' | 'blur'
type DrawerPosition = 'top' | 'bottom' | 'left' | 'right'

const dialogVisible = ref(false)
const drawerVisible = ref(false)
const dialogMask = ref<MaskStyle>('blur')
const drawerMask = ref<MaskStyle>('dim')
const drawerPosition = ref<DrawerPosition>('bottom')

const maskOptions: Array<{ label: string, value: MaskStyle }> = [
  { label: '无遮罩', value: 'none' },
  { label: '半透明', value: 'dim' },
  { label: '毛玻璃', value: 'blur' },
]

const drawerOptions: Array<{ label: string, value: DrawerPosition }> = [
  { label: '上方', value: 'top' },
  { label: '右侧', value: 'right' },
  { label: '下方', value: 'bottom' },
  { label: '左侧', value: 'left' },
]

function notify(message: string) {
  uni.showToast({ icon: 'none', title: message })
}
</script>

<template>
  <JnPageLayout title="弹窗与抽屉" back-mode="auto">
    <view class="jn-card p-[28rpx] flex flex-col gap-[24rpx]">
      <view>
        <text class="block text-[34rpx] font-bold jn-text-primary">JnDialog</text>
        <text class="block mt-[8rpx] text-[25rpx] jn-text-tertiary">居中弹窗：标题、副标题、关闭按钮、操作按钮和外部关闭入口。</text>
      </view>

      <view class="flex flex-wrap gap-[16rpx]">
        <view
          v-for="option in maskOptions"
          :key="option.value"
          class="overlay-option"
          :class="{ 'overlay-option--active': dialogMask === option.value }"
          @click="dialogMask = option.value"
        >
          <text>{{ option.label }}</text>
        </view>
      </view>

      <view class="overlay-open-button" @click="dialogVisible = true"><text>打开居中弹窗</text></view>
    </view>

    <view class="jn-card p-[28rpx] flex flex-col gap-[24rpx]">
      <view>
        <text class="block text-[34rpx] font-bold jn-text-primary">JnDrawer</text>
        <text class="block mt-[8rpx] text-[25rpx] jn-text-tertiary">抽屉可从四个方向滑出；下方抽屉可同时展示顶部取消/确认和底部确认。</text>
      </view>

      <view class="flex flex-wrap gap-[16rpx]">
        <view
          v-for="option in drawerOptions"
          :key="option.value"
          class="overlay-option"
          :class="{ 'overlay-option--active': drawerPosition === option.value }"
          @click="drawerPosition = option.value"
        >
          <text>{{ option.label }}</text>
        </view>
      </view>

      <view class="flex flex-wrap gap-[16rpx]">
        <view
          v-for="option in maskOptions"
          :key="option.value"
          class="overlay-option"
          :class="{ 'overlay-option--active': drawerMask === option.value }"
          @click="drawerMask = option.value"
        >
          <text>{{ option.label }}</text>
        </view>
      </view>

      <view class="overlay-open-button" @click="drawerVisible = true"><text>打开抽屉</text></view>
    </view>

    <view class="jn-card p-[28rpx] flex flex-col gap-[12rpx]">
      <text class="text-[28rpx] font-bold jn-text-primary">遮罩模式</text>
      <text class="text-[24rpx] jn-text-secondary">“无遮罩”保留点击拦截；“毛玻璃”在支持 backdrop-filter 的平台呈现模糊，其他端自动降级为半透明遮罩。</text>
    </view>

    <JnDialog
      v-model="dialogVisible"
      title="发布前确认"
      :subtitle="`dialog-mask: ${dialogMask}`"
      :mask-style="dialogMask"
      show-external-close
      external-close-text="暂不处理"
      @cancel="notify('已取消')"
      @confirm="notify('已确认')"
    >
      <text>这是默认插槽内容。可通过 props 控制标题区、取消/确认按钮、遮罩及关闭行为，也可以用具名插槽替换标题和操作区。</text>
    </JnDialog>

    <JnDrawer
      v-model="drawerVisible"
      :position="drawerPosition"
      title="筛选条件"
      :subtitle="`drawer: ${drawerPosition} / mask: ${drawerMask}`"
      :mask-style="drawerMask"
      :show-top-actions="drawerPosition === 'bottom'"
      show-footer
      @cancel="notify('已取消筛选')"
      @confirm="notify('已应用筛选')"
    >
      <view class="flex flex-col gap-[20rpx]">
        <text>抽屉主体内容可自由滚动。左、右抽屉使用 width；上、下抽屉使用 height。</text>
        <view class="drawer-demo-row"><text>状态</text><text class="jn-text-tertiary">进行中</text></view>
        <view class="drawer-demo-row"><text>时间</text><text class="jn-text-tertiary">最近 30 天</text></view>
      </view>
    </JnDrawer>
  </JnPageLayout>
</template>

<style lang="scss" scoped>
.overlay-option {
  padding: 12rpx 20rpx;
  color: var(--jn-color-text-secondary);
  background: var(--jn-color-surface-overlay);
  border: 1rpx solid var(--jn-color-border);
  border-radius: var(--jn-radius-control);
  font-size: 24rpx;
}

.overlay-option--active {
  color: var(--jn-color-text-inverse);
  background: var(--jn-color-primary);
  border-color: var(--jn-color-primary);
}

.overlay-open-button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 84rpx;
  color: var(--jn-color-text-inverse);
  background: var(--jn-color-primary);
  border-radius: var(--jn-radius-control);
  box-shadow: var(--jn-shadow-button);
  font-size: 28rpx;
  font-weight: 700;
}

.drawer-demo-row {
  display: flex;
  justify-content: space-between;
  padding: 20rpx;
  background: var(--jn-color-surface-overlay);
  border: 1rpx solid var(--jn-color-divider);
  border-radius: var(--jn-radius-control);
}
</style>
