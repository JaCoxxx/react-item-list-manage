// 主题 Pinia store：状态 + 缓存持久化。
// H5 应用到 <html>；小程序与 App 由 layouts 的页面根节点承载 themeClass。
// src/stores 下的导出（useThemeStore / themeList）与 pinia 的 defineStore/storeToRefs 均自动导入。
export type ThemeName =
  | 'morning-mist'
  | 'deep-ocean'
  | 'amber-night'
  | 'dusk-blush'
  | 'obsidian-gold'
  | 'jade-paper'
  | 'violet-dawn'
  | 'azure-breeze'
  | 'citrus-cream'
  | 'rosewater'
  | 'coral-sand'
  | 'slate-paper'
  | 'pure-white'
  | 'midnight-mono'
  | 'aurora-glass'
  | 'terminal-grid'
  | 'candy-pop'
  | 'ink-landscape'
  | 'vermilion-palace'
  | 'jade-scroll'
  | 'neon-matrix'
  | 'quantum-violet'
  | 'arctic-circuit'
  | 'sapphire-orbit'
  | 'bagua-taoist'

export type ThemeKind = 'light' | 'heavy' | 'classic' | 'tech' | 'taoist'

export const themeList = [
  { name: 'morning-mist', label: '晨雾青绿', kind: 'heavy' },
  { name: 'deep-ocean', label: '深海蓝紫', kind: 'heavy' },
  { name: 'amber-night', label: '琥珀暖夜', kind: 'heavy' },
  { name: 'dusk-blush', label: '暮樱粉雾', kind: 'heavy' },
  { name: 'obsidian-gold', label: '曜石黑金', kind: 'heavy' },
  { name: 'jade-paper', label: '青玉纸感', kind: 'light' },
  { name: 'violet-dawn', label: '紫罗兰晨曦', kind: 'light' },
  { name: 'azure-breeze', label: '蔚蓝微风', kind: 'light' },
  { name: 'citrus-cream', label: '柑橘奶油', kind: 'light' },
  { name: 'rosewater', label: '玫瑰水色', kind: 'light' },
  { name: 'coral-sand', label: '珊瑚沙丘', kind: 'light' },
  { name: 'slate-paper', label: '岩灰纸张', kind: 'light' },
  { name: 'pure-white', label: '纯白极简', kind: 'light' },
  { name: 'midnight-mono', label: '黑夜单色', kind: 'light' },
  { name: 'aurora-glass', label: '极光玻璃', kind: 'heavy' },
  { name: 'terminal-grid', label: '终端网格', kind: 'heavy' },
  { name: 'candy-pop', label: '糖果波普', kind: 'heavy' },
  { name: 'ink-landscape', label: '水墨山岚', kind: 'classic' },
  { name: 'vermilion-palace', label: '朱墙金阙', kind: 'classic' },
  { name: 'jade-scroll', label: '青玉书卷', kind: 'classic' },
  { name: 'bagua-taoist', label: '太极八卦', kind: 'taoist' },
  { name: 'neon-matrix', label: '霓虹矩阵', kind: 'tech' },
  { name: 'quantum-violet', label: '量子紫光', kind: 'tech' },
  { name: 'arctic-circuit', label: '冰川电路', kind: 'tech' },
  { name: 'sapphire-orbit', label: '深蓝星轨', kind: 'tech' },
] as const

const STORAGE_KEY = 'jn-theme'
const DEFAULT_THEME: ThemeName = 'morning-mist'

function getSavedTheme(): ThemeName {
  try {
    return (uni.getStorageSync(STORAGE_KEY) || DEFAULT_THEME) as ThemeName
  }
  catch {
    return DEFAULT_THEME
  }
}

// H5 把主题类挂到 <html>；非 H5 平台由每个页面布局根节点绑定 themeClass。
function applyToRoot(theme: ThemeName) {
  // #ifdef H5
  const root = document.documentElement
  themeList.forEach((t) => {
    root.classList.remove(`jn-theme-${t.name}`)
  })
  root.classList.add(`jn-theme-${theme}`)
  // #endif
}

export const useThemeStore = defineStore('theme', () => {
  // 从缓存初始化当前主题
  const currentTheme = ref<ThemeName>(getSavedTheme())
  const themeClass = computed(() => `jn-theme-${currentTheme.value}`)

  // 任何主题变化都写回 storage；H5 同时更新 <html>，MP/App 页面根节点响应式更新。
  watch(currentTheme, (theme) => {
    uni.setStorageSync(STORAGE_KEY, theme)
    applyToRoot(theme)
  })

  function setTheme(theme: ThemeName) {
    currentTheme.value = theme
  }

  // 启动时恢复缓存主题。MP/App 的布局根节点会从 currentTheme 自动取得主题类。
  function initTheme() {
    applyToRoot(currentTheme.value)
  }

  return { currentTheme, themeClass, setTheme, initTheme }
})
