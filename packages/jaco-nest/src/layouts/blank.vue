<script setup lang="ts">
const { themeClass } = storeToRefs(useThemeStore())
</script>

<template>
  <view :class="themeClass">
    <slot />
  </view>
</template>
