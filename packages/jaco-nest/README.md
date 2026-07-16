<p align="center">
  <img src="https://github.com/uni-helper/vitesse-uni-app/raw/main/.github/images/preview.png" width="300"/>
</p>

<h2 align="center">
Vitesse for uni-app
</h2>
<p align="center">
  <a href="https://vitesse-uni-app.netlify.app/">📱 在线预览</a>
  <a href="https://uni-helper.js.org/vitesse-uni-app">📖 阅读文档</a>
</p>

## 特性

- ⚡️ [Vue 3](https://github.com/vuejs/core), [Vite](https://github.com/vitejs/vite), [pnpm](https://pnpm.io/), [esbuild](https://github.com/evanw/esbuild) - 就是快！

- 🔧 [ESM 优先](https://github.com/uni-helper/plugin-uni)

- 🗂 [基于文件的路由](./src/pages)

- 📦 [组件自动化加载](./src/components)

- 📑 [布局系统](./src/layouts)

- 🎨 [UnoCSS](https://github.com/unocss/unocss) - 高性能且极具灵活性的即时原子化 CSS 引擎

- 😃 [各种图标集为你所用](https://github.com/antfu/unocss/tree/main/packages/preset-icons)

- 🔥 使用 [新的 `<script setup>` 语法](https://github.com/vuejs/rfcs/pull/227)

- 📥 [API 自动加载](https://github.com/antfu/unplugin-auto-import) - 直接使用 Composition API 无需引入

- 🦾 [TypeScript](https://www.typescriptlang.org/) & [ESLint](https://eslint.org/) - 保证代码质量

## 自定义导航栏 AppHeader

`pages.config.ts` 的 `globalStyle` 已设 `navigationStyle: 'custom'`，原生导航栏禁用，改由 `src/components/AppHeader.vue` 渲染（`sticky top-0`，自动留状态栏安全区）。逻辑抽到 `src/composables/useAppHeader.ts`，类型在 `src/types/header.ts`。

通常通过 `src/components/PageLayout.vue` 透传使用（组件/composable/util 均自动导入，无需 import）：

```vue
<template>
  <PageLayout
    title="标题"
    title-align="center"           <!-- left | center | right，默认 center -->
    :show-header="true"            <!-- false 时不渲染导航栏，仅留状态栏安全区 -->
    back-mode="auto"               <!-- auto | back | home | none，默认 auto -->
    :is-list-page="false"          <!-- 仅 auto 生效 -->
    home-path="/pages/index"       <!-- 首页按钮跳转地址 -->
    :actions="actions"             <!-- HeaderAction[]，见下 -->
  >
    <view>页面内容</view>
  </PageLayout>
</template>
```

**左侧按钮**（`backMode="auto"` 时自动判定）：

| 条件 | 显示 | 行为 |
| --- | --- | --- |
| 有历史（`getCurrentPages().length > 1`） | ‹ 返回 | `uni.navigateBack()`，无历史兜底回首页 |
| 无历史 + 列表页（`isListPage`） | 首页 | `uni.reLaunch` 到 `homePath` |
| 无历史 + 非列表页（如首页本身） | 不显示 | - |

可用 `backMode="back"|"home"|"none"` 强制覆盖。

**右侧操作**（`actions: { text, onClick }[]`）：只展示一个按钮。0 个不显示；1 个直接显示；**≥2 个显示 `⋯`，点击弹底部 ActionSheet，所有操作项都收在其中**。

示例见 `src/pages/index.vue`（首页、2 操作收进 ⋯）与 `src/pages/hi.vue`（子页、有历史->返回按钮、1 操作内联）。

