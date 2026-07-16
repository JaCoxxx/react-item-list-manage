<script setup lang="ts">
type DrawerPosition = 'top' | 'bottom' | 'left' | 'right'
type MaskStyle = 'none' | 'dim' | 'blur'
type CloseReason = 'api' | 'close-button' | 'cancel' | 'confirm' | 'popup'

const props = withDefaults(defineProps<{
  modelValue?: boolean
  position?: DrawerPosition
  title?: string
  subtitle?: string
  width?: string
  height?: string
  showClose?: boolean
  showTopActions?: boolean
  showFooter?: boolean
  cancelText?: string
  confirmText?: string
  closeOnMask?: boolean
  closeOnCancel?: boolean
  closeOnConfirm?: boolean
  maskStyle?: MaskStyle
}>(), {
  modelValue: false,
  position: 'right',
  title: '',
  subtitle: '',
  width: '640rpx',
  height: '72vh',
  showClose: true,
  showTopActions: false,
  showFooter: false,
  cancelText: '取消',
  confirmText: '确认',
  closeOnMask: true,
  closeOnCancel: true,
  closeOnConfirm: true,
  maskStyle: 'dim',
})

const emit = defineEmits<{
  'update:modelValue': [visible: boolean]
  open: []
  close: [reason: CloseReason]
  cancel: []
  confirm: []
  maskClick: []
}>()

const popup = ref<{ open: (type?: string) => void, close: () => void }>()
const isSideDrawer = computed(() => props.position === 'left' || props.position === 'right')
const panelStyle = computed(() => isSideDrawer.value
  ? { width: props.width, height: '100vh' }
  : { width: '100vw', maxHeight: props.height })
const maskBackgroundColor = computed(() => {
  if (props.maskStyle === 'none')
    return 'transparent'
  if (props.maskStyle === 'blur')
    return 'var(--jn-color-overlay-light)'
  return 'var(--jn-color-overlay)'
})

watch(() => props.modelValue, async (visible) => {
  await nextTick()
  if (visible)
    popup.value?.open(props.position)
  else
    popup.value?.close()
}, { immediate: true })

function setVisible(visible: boolean) {
  emit('update:modelValue', visible)
}

function requestClose(reason: CloseReason) {
  if (!props.modelValue)
    return
  setVisible(false)
  emit('close', reason)
}

function handlePopupChange(event: { show: boolean }) {
  if (event.show) {
    emit('open')
    return
  }

  if (props.modelValue)
    requestClose('popup')
}

function handleCancel() {
  emit('cancel')
  if (props.closeOnCancel)
    requestClose('cancel')
}

function handleConfirm() {
  emit('confirm')
  if (props.closeOnConfirm)
    requestClose('confirm')
}

function handleMaskClick() {
  emit('maskClick')
}

defineExpose({
  open: () => setVisible(true),
  close: () => requestClose('api'),
})
</script>

<template>
  <uni-popup
    ref="popup"
    class="jn-overlay-popup jn-drawer-popup"
    :class="`jn-overlay-popup--${maskStyle}`"
    :type="position"
    background-color="transparent"
    :is-mask-click="closeOnMask"
    :mask-background-color="maskBackgroundColor"
    @change="handlePopupChange"
    @mask-click="handleMaskClick"
  >
    <view class="jn-card jn-drawer__panel" :class="`jn-drawer__panel--${position}`" :style="panelStyle">
      <view v-if="position === 'bottom' && showTopActions" class="jn-drawer__top-actions">
        <view class="jn-drawer__text-action" @click="handleCancel"><text>{{ cancelText }}</text></view>
        <view class="jn-drawer__text-action jn-drawer__text-action--primary" @click="handleConfirm"><text>{{ confirmText }}</text></view>
      </view>

      <view v-if="title || subtitle || showClose" class="jn-drawer__header">
        <view class="min-w-0 flex-1">
          <slot name="title">
            <text v-if="title" class="jn-drawer__title">{{ title }}</text>
          </slot>
          <slot name="subtitle">
            <text v-if="subtitle" class="jn-drawer__subtitle">{{ subtitle }}</text>
          </slot>
        </view>
        <view v-if="showClose" class="jn-drawer__close i-carbon-close" @click="requestClose('close-button')" />
      </view>

      <view v-if="title || subtitle || showClose" class="jn-drawer__divider" />

      <scroll-view class="jn-drawer__body" scroll-y>
        <slot />
      </scroll-view>

      <view v-if="showFooter" class="jn-drawer__footer">
        <slot name="footer">
          <view class="jn-drawer__footer-confirm" @click="handleConfirm"><text>{{ confirmText }}</text></view>
        </slot>
      </view>
    </view>
  </uni-popup>
</template>

<style lang="scss">
.jn-drawer__panel {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  max-width: 100vw;
  padding: 32rpx;
}

.jn-drawer__panel--bottom {
  min-height: 360rpx;
  border-bottom: 0;
  border-radius: var(--jn-radius-card) var(--jn-radius-card) 0 0;
}

.jn-drawer__panel--top {
  min-height: 300rpx;
  border-top: 0;
  border-radius: 0 0 var(--jn-radius-card) var(--jn-radius-card);
}

.jn-drawer__panel--left {
  border-left: 0;
  border-radius: 0 var(--jn-radius-card) var(--jn-radius-card) 0;
}

.jn-drawer__panel--right {
  border-right: 0;
  border-radius: var(--jn-radius-card) 0 0 var(--jn-radius-card);
}

.jn-drawer__top-actions,
.jn-drawer__header {
  display: flex;
  align-items: flex-start;
}

.jn-drawer__top-actions {
  justify-content: space-between;
  min-height: 56rpx;
  margin-bottom: 20rpx;
}

.jn-drawer__text-action {
  color: var(--jn-color-text-secondary);
  font-size: 28rpx;
}

.jn-drawer__text-action--primary {
  color: var(--jn-color-primary);
  font-weight: 700;
}

.jn-drawer__header {
  gap: 24rpx;
}

.jn-drawer__title,
.jn-drawer__subtitle {
  display: block;
}

.jn-drawer__title {
  color: var(--jn-color-text-primary);
  font-size: 36rpx;
  font-weight: 700;
  line-height: 1.35;
}

.jn-drawer__subtitle {
  margin-top: 8rpx;
  color: var(--jn-color-text-tertiary);
  font-size: 24rpx;
  line-height: 1.5;
}

.jn-drawer__close {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 52rpx;
  height: 52rpx;
  color: var(--jn-color-text-secondary);
  border: 1rpx solid var(--jn-color-border);
  border-radius: 50%;
  font-size: 28rpx;
}

.jn-drawer__divider {
  height: 1rpx;
  margin: 28rpx 0;
  background: var(--jn-color-divider);
}

.jn-drawer__body {
  flex: 1;
  min-height: 0;
  color: var(--jn-color-text-secondary);
  font-size: 28rpx;
  line-height: 1.65;
}

.jn-drawer__footer {
  padding-top: 28rpx;
}

.jn-drawer__footer-confirm {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 84rpx;
  color: var(--jn-color-text-inverse);
  background: var(--jn-color-primary);
  border-radius: var(--jn-radius-control);
  box-shadow: var(--jn-shadow-button);
  font-size: 30rpx;
  font-weight: 700;
}
</style>
