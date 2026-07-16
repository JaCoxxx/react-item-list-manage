# jaco-nest 主题方案（jn- 前缀）

主题资源位于 `src/theme/`：`themes.css`（样式）+ 原有主题背景/预览图；古风、道教与科技风主题的竖版背景图在 `src/theme/assets/`（941×1672），预览卡直接复用背景图裁切。逻辑在 `src/composables/useTheme.ts`（自动导入）。

## 25 个主题与分层

| 类型 | 主题 name | 标签 | 背景/预览 |
| --- | --- | --- | --- |
| 轻主题 | `jade-paper` | 青玉纸感 | 仅替换语义配色，无背景图 |
| 轻主题 | `violet-dawn` | 紫罗兰晨曦 | 仅替换语义配色，无背景图 |
| 轻主题 | `azure-breeze` | 蔚蓝微风 | 仅替换语义配色，无背景图 |
| 轻主题 | `citrus-cream` | 柑橘奶油 | 仅替换语义配色，无背景图 |
| 轻主题 | `rosewater` | 玫瑰水色 | 仅替换语义配色，无背景图 |
| 轻主题 | `coral-sand` | 珊瑚沙丘 | 仅替换语义配色，无背景图 |
| 轻主题 | `slate-paper` | 岩灰纸张 | 仅替换语义配色，无背景图 |
| 轻主题 | `pure-white` | 纯白极简 | 冷白表面、近黑主操作色、蓝灰信息层级 |
| 轻主题 | `midnight-mono` | 黑夜单色 | 深色表面、浅青主操作色、低饱和暖冷辅助色 |
| 重主题 | `morning-mist` | 晨雾青绿 | 背景图、自然大圆角、柔和浮影 |
| 重主题 | `deep-ocean` | 深海蓝紫 | 背景图、玻璃表面、胶囊控件 |
| 重主题 | `amber-night` | 琥珀暖夜 | 背景图、直角编辑感、硬阴影 |
| 重主题 | `dusk-blush` | 暮樱粉雾 | 背景图、不规则圆角、偏移阴影 |
| 重主题 | `obsidian-gold` | 曜石黑金 | 背景图、装饰艺术直角、金色硬阴影 |
| 重主题 | `aurora-glass` | 极光玻璃 | 多层渐变背景、玻璃表面、胶囊控件 |
| 重主题 | `terminal-grid` | 终端网格 | 网格背景、直角卡片、硬阴影 |
| 重主题 | `candy-pop` | 糖果波普 | 气泡渐变、不规则圆角、偏移阴影 |
| 古风重主题 | `ink-landscape` | 水墨山岚 | 水墨渐层、自然异形圆角、纸张表面 |
| 古风重主题 | `vermilion-palace` | 朱墙金阙 | 朱砂金箔、直角宫墙、金色硬阴影 |
| 古风重主题 | `jade-scroll` | 青玉书卷 | 玉色书卷、卷轴圆角、矿物金点缀 |
| 道教风重主题 | `bagua-taoist` | 太极八卦 | 黑白宣纸、全域卦象纹样、云气与墨线几何 |
| 科技风重主题 | `neon-matrix` | 霓虹矩阵 | 青色网格、霓虹发光、锐利控件 |
| 科技风重主题 | `quantum-violet` | 量子紫光 | 紫色光晕、玻璃表面、非对称圆角 |
| 科技风重主题 | `arctic-circuit` | 冰川电路 | 冰蓝电路、分割线背景、克制圆角 |
| 科技风重主题 | `sapphire-orbit` | 深蓝星轨 | 深蓝结构光、玻璃表面、精密星轨线条 |

`main.ts` 里 `import './theme/themes.css'`，Vite 打包时随 CSS 处理相对 `url()`，H5 可用。

## 切换原理（即时生效，无需刷新）

- 每个主题是一个 `.jn-theme-<name>` 类，定义 `--jn-*` 语义变量（颜色/阴影/圆角/背景图）。
- `setTheme(name)` 把 `jn-theme-<name>` 类挂到 `document.documentElement`（`<html>`，H5），CSS 变量级联到所有页面，浏览器即时重算，**无需刷新**。
- `initTheme()` 在 `App.vue` 的 `onLaunch` 调用，按 `uni.getStorageSync('jn-theme')` 恢复上次主题。
- 小程序与 App 无 `document`，由 `layouts/default.vue`、`layouts/blank.vue` 的页面根节点绑定 `themeClass`；切换时所有布局页会响应式更新，并在下次启动从本地缓存恢复。

## 用法

页面切换主题（`useTheme` 自动导入，无需 import）：

```vue
<script setup lang="ts">
import type { ThemeName } from '@/composables/useTheme'

const { currentTheme, themeList, themeClass, setTheme } = useTheme()

function pick(name: ThemeName) {
  setTheme(name) // 即时生效 + 持久化
}
</script>

<template>
  <!-- 全屏主题页：jn-page 提供背景图，themeClass 提供变量 -->
  <view :class="['jn-page', themeClass]">
    <view v-for="t in themeList" :key="t.name" class="jn-card" @click="pick(t.name)">
      {{ t.label }}
    </view>
  </view>
</template>
```

组件内部只使用 `var(--jn-color-primary)`、`var(--jn-color-text-primary)` 等语义变量，或 `.jn-card` / `.jn-btn--primary` / `.jn-btn--secondary` 这些 `jn-` 前缀类，**不要直接写主题色值**。

可用的语义变量：`--jn-color-page-bg`、`--jn-color-surface`、`--jn-color-surface-solid/muted/overlay/overlay-strong`、`--jn-color-text-primary/secondary/tertiary/inverse`、`--jn-color-border/divider`、`--jn-color-primary/primary-hover/primary-soft/secondary/accent/success/warning/danger`、`--jn-color-success/warning/danger-soft`、`--jn-color-overlay-*`（蒙层与阴影层级）、`--jn-color-transparent`、`--jn-shadow-card/button`、`--jn-radius-card/control`、`--jn-bg-image`（竖版背景）、`--jn-preview-image`（正方形预览）、`--jn-surface-image`（重主题面板纹理；轻主题默认不设置）。

切换页按钮用预览图做背景：按钮套自己的 `jn-theme-<name>` 类以取该主题的 `--jn-preview-image`，再 `background-image: var(--jn-preview-image)`（见 `src/pages/theme.vue`）。

## 平台限制

主题色、组件表面与状态色在 H5、小程序和 App（Vue 页面）均通过页面根节点的 CSS 变量生效。背景图走 CSS `background-image`，微信小程序对 WXSS 本地背景图有限制（颜色变量仍生效，背景图可能不显示）；若需稳定展示背景图，改用 `<image>` 组件叠加。

## 入口

首页（`src/pages/index.vue`）JnAppHeader 的 ⋯ 菜单使用 `uni-popup` 展示「主题」入口（跳转 `src/pages/theme.vue`）和「组件」入口（跳转 `src/pages/ui.vue`，展示 uni-ui 在主题下的表现）；有页面栈时左上角显示返回图标，直接进入的非首页页面显示首页图标。

## uni-ui（uni_modules）组件主题化

`src/uni_modules/` 下的 uni-ui 组件也跟随主题：`src/uni.scss` 把公共 SCSS 颜色变量映射到 `var(--jn-color-*)`；组件源码内的颜色默认值、内联样式、遮罩与阴影也已改为对应的语义变量。因此主色、中性色、状态色、表面、边框和浮层都会随主题即时变化。

| uni.scss 变量 | 映射到 |
| --- | --- |
| `$uni-primary` / `$uni-color-primary` | `var(--jn-color-primary)` |
| `$uni-success` / `$uni-color-success` | `var(--jn-color-success)` |
| `$uni-warning` / `$uni-color-warning` | `var(--jn-color-warning)` |
| `$uni-error` / `$uni-color-error` | `var(--jn-color-danger)` |
| `$uni-info` | `var(--jn-color-text-tertiary)` |
| `$uni-main-color` / `$uni-text-color` | `var(--jn-color-text-primary)` |
| `$uni-base-color` / `$uni-text-color-grey` | `var(--jn-color-text-secondary)` |
| `$uni-secondary-color` / `$uni-extra-color` / `$uni-text-color-placeholder/disable` | `var(--jn-color-text-tertiary)` |
| `$uni-text-color-inverse` | `var(--jn-color-text-inverse)` |
| `$uni-bg-color` / `$uni-bg-color-grey` | `var(--jn-color-page-bg)` |
| `$uni-bg-color-hover` | `var(--jn-color-surface-muted)` |
| `$uni-border-color` / `$uni-border-3` / `$uni-border-4` | `var(--jn-color-border)` |
| `$uni-border-1` / `$uni-border-2` | `var(--jn-color-divider)` |

尺寸/圆角/间距/字体（`$uni-font-size-*`、`$uni-border-radius-*`、`$uni-spacing-*`）保持固定 px；`$uni-black`、`$uni-white`、`$uni-transparent` 与 `$uni-bg-color-mask` 分别映射到主题文本、表面、透明与蒙层变量。

**兼容处理**（SCSS 颜色函数无法作用于 `var()`，已改用 CSS 变量直写）：`uni-easyinput.vue` 错误占位符 `mix(#fff,$uni-error,50%)` -> `var(--jn-color-danger)`；`uni-datetime-picker/calendar-item.vue` 日期文字 `darken($uni-primary,40%)` -> `var(--jn-color-primary)`。

`src/pages/ui.vue` 是组件主题回归页，覆盖状态展示、输入选择、表格日期、折叠栅格和浮层。切换主题后可直接检查这些高频视觉场景。

**type-check**：`tsconfig.json` 已 `exclude: ["src/uni_modules/**"]`（uni-ui 源码有 `#ifdef` 重复声明、`.wxs` 模块等 vue-tsc 处理不了的问题）。app 自身代码仍受检查；`<uni-*>` props 类型由 `@uni-helper/uni-types` 全局提供仍校验。
