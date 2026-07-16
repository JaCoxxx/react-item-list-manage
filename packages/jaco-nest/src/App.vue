<script setup lang="ts">
onLaunch(() => {
  // 启动时按缓存恢复。H5 更新 <html>；MP/App 由页面布局根节点继承主题变量。
  useThemeStore().initTheme()
})
</script>
