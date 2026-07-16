// 示例 Pinia store（setup 写法）。src/stores 下的导出会被 unplugin-auto-import 自动导入，
// defineStore / storeToRefs 等由 AutoImport 的 'pinia' 预设自动导入，无需手动 import。
export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)
  const double = computed(() => count.value * 2)

  function inc() {
    count.value += 1
  }
  function dec() {
    count.value -= 1
  }
  function reset() {
    count.value = 0
  }

  return { count, double, inc, dec, reset }
})
