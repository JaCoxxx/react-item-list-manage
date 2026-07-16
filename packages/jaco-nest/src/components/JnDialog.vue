<script setup lang="ts">
type MaskStyle = 'none' | 'dim' | 'blur'
type CloseReason = 'api' | 'close-button' | 'cancel' | 'confirm' | 'popup'

const props = withDefaults(defineProps<{
  modelValue?: boolean
  title?: string
  subtitle?: string
  width?: string
  showClose?: boolean
  showActions?: boolean
  showCancel?: boolean
  showConfirm?: boolean
  cancelText?: string
  confirmText?: string
  showExternalClose?: boolean
  externalCloseText?: string
  closeOnMask?: boolean
  closeOnCancel?: boolean
  closeOnConfirm?: boolean
  maskStyle?: MaskStyle
}>(), {
  modelValue: false,
  title: '',
  subtitle: '',
  width: '640rpx',
  showClose: true,
  showActions: true,
  showCancel: true,
  showConfirm: true,
  cancelText: '取消',
  confirmText: '确认',
  showExternalClose: false,
  externalCloseText: '关闭',
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

const maskBackgroundColor = computed(() => {
  if (props.maskStyle === 'none')
    return 'transparent'
  if (props.maskStyle === 'blur')
    return 'var(--jn-color-overlay-light)'
  return 'var(--jn-color-overlay)'
})

const hasHeader = computed(() => props.title || props.subtitle || props.showClose)

watch(() => props.modelValue, async (visible) => {
  await nextTick()
  if (visible)
    popup.value?.open('center')
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
    class="jn-overlay-popup jn-dialog-popup"
    :class="`jn-overlay-popup--${maskStyle}`"
    type="center"
    background-color="transparent"
    :is-mask-click="closeOnMask"
    :mask-background-color="maskBackgroundColor"
    @change="handlePopupChange"
    @mask-click="handleMaskClick"
  >
    <view class="jn-dialog__shell">
      <view class="jn-card jn-dialog__panel" :style="{ width }">
        <view v-if="hasHeader" class="jn-dialog__header">
          <view class="min-w-0 flex-1">
            <slot name="title">
              <text v-if="title" class="jn-dialog__title">{{ title }}</text>
            </slot>
            <slot name="subtitle">
              <text v-if="subtitle" class="jn-dialog__subtitle">{{ subtitle }}</text>
            </slot>
          </view>
          <view v-if="showClose" class="jn-dialog__close i-carbon-close" @click="requestClose('close-button')" />
        </view>

        <view v-if="hasHeader" class="jn-dialog__divider" />

        <view class="jn-dialog__body">
          <slot />
        </view>

        <view v-if="showActions" class="jn-dialog__actions">
          <slot name="actions">
            <view v-if="showCancel" class="jn-dialog__action jn-dialog__action--secondary" @click="handleCancel">
              <text>{{ cancelText }}</text>
            </view>
            <view v-if="showConfirm" class="jn-dialog__action jn-dialog__action--primary" @click="handleConfirm">
              <text>{{ confirmText }}</text>
            </view>
          </slot>
        </view>
      </view>

      <view v-if="showExternalClose" class="jn-dialog__external-close" @click="requestClose('close-button')">
        <view class="i-carbon-close text-[28rpx]" />
        <text>{{ externalCloseText }}</text>
      </view>
    </view>
  </uni-popup>
</template>

<style lang="scss">
.jn-dialog__shell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
  max-width: calc(100vw - 64rpx);
}

.jn-dialog__panel {
  box-sizing: border-box;
  max-width: 100%;
  padding: 36rpx;
}

.jn-dialog__header {
  display: flex;
  align-items: flex-start;
  gap: 24rpx;
}

.jn-dialog__title,
.jn-dialog__subtitle {
  display: block;
}

.jn-dialog__title {
  color: var(--jn-color-text-primary);
  font-size: 36rpx;
  font-weight: 700;
  line-height: 1.35;
}

.jn-dialog__subtitle {
  margin-top: 8rpx;
  color: var(--jn-color-text-tertiary);
  font-size: 24rpx;
  line-height: 1.5;
}

.jn-dialog__close {
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

.jn-dialog__divider {
  height: 1rpx;
  margin: 28rpx 0;
  background: var(--jn-color-divider);
}

.jn-dialog__body {
  color: var(--jn-color-text-secondary);
  font-size: 28rpx;
  line-height: 1.65;
}

.jn-dialog__actions {
  display: flex;
  gap: 20rpx;
  margin-top: 36rpx;
}

.jn-dialog__action {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 80rpx;
  border-radius: var(--jn-radius-control);
  font-size: 28rpx;
}

.jn-dialog__action--secondary {
  color: var(--jn-color-primary);
  background: var(--jn-color-primary-soft);
}

.jn-dialog__action--primary {
  color: var(--jn-color-text-inverse);
  background: var(--jn-color-primary);
  box-shadow: var(--jn-shadow-button);
}

.jn-dialog__external-close {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  min-height: 64rpx;
  padding: 0 28rpx;
  color: var(--jn-color-text-primary);
  background: var(--jn-color-surface-solid);
  border: 1rpx solid var(--jn-color-border);
  border-radius: 999rpx;
  font-size: 24rpx;
}
</style>
