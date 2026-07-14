# 组件全部换为 uni-ui

## 安装 + easycom

1. `pnpm --filter item-list-uni-app add @dcloudio/uni-ui`
2. `pages.json` 顶层加 easycom（uni-ui 组件自动引入，无需逐个 import）:
```json
"easycom": {
  "autoscan": true,
  "custom": { "^uni-(.*)": "@dcloudio/uni-ui/lib/uni-$1/uni-$1.vue" }
}
```

## 组件映射

| 现有 | uni-ui 替代 | 关键 props/用法 |
|---|---|---|
| `PanelCard` 自定义组件 | `uni-card` | `title` `sub-title` `is-shadow` `padding`，内容默认 slot |
| `Popup` 自定义组件 | `uni-popup` | `type="bottom"`，`ref.open()`/`ref.close()`，`@change` 同步显隐 |
| `<input>` | `uni-easyinput` | `v-model` `placeholder` `type` |
| `<textarea>` | `uni-easyinput` | `type="textarea"` `v-model` `placeholder` `:maxlength` |
| `notice-error/warning/info/success` | `uni-notice-bar` | `text` `type`(error/warning/primary/success) `:speed="0"` 静态 |
| `chip` / `chip-dark` | `uni-tag` | `text` `type`(primary/success/warning/error/default) `inverted` |
| `list-row` | `uni-list` + `uni-list-item` | `title` `note` `clickable` `@click` |
| `empty-state` | `uni-list-item disabled` 或 `uni-title` 文本 | — |
| 加载中 | `uni-load-more` | `status="loading"` |
| `<button>` | **保留原生** | uni-ui 无 uni-button，保留 `button` + 现有 class |
| `<picker>` / `<view>` / `<text>` | **保留原生** | uni-ui 不替代这些基础组件 |
| `PageLayout` | **保留** | 布局壳（页头 + slot），内部用原生 view/text |

## 改动范围

### 组件
- **删除** `PanelCard.vue`、`Popup.vue`（被 uni-card/uni-popup 替代）
- **保留** `PageLayout.vue`（布局壳，仍用原生 view/text）

### 页面（10 个全部重写 template）
按组件映射替换。重点：
- **inventory**：4 个 Popup → uni-popup（需把 `filterOpen`/`stockInOpen`/`stockOutOpen`/`detailOpen` 的布尔 state 改成 `ref` + `.open()/.close()`，`@change` 同步）；PanelCard → uni-card；input → uni-easyinput
- **items / base-options / tags / quick-stock / overview / tools / ocr-upload / ai-receipt / ai-chat-ops**：PanelCard → uni-card，input/textarea → uni-easyinput，notice → uni-notice-bar，chip → uni-tag

### `App.vue` 全局样式
- **删除**被替代的 class：`panel-card`/`panel-head`/`panel-title`/`text-input`/`text-area`/`picker-display`/`notice-*`/`chip`/`list-row`/`empty-state`/`item-card`/`stat-card`/`menu-card` 等
- **保留**：`page` 选择器（小程序必需）、`page-shell`/`page-stack`/`page-header`/`page-title`（PageLayout 用）、`button-primary`/`button-secondary`/`button-danger`（原生 button 用）、`stack-*`/`row-wrap`/`form-grid`/`two-col`（布局）、`muted`/`item-title`/`field-label`/`field-hint`（文本）

## 风险点
1. **uni-popup 用 ref 控制**（非 visible prop）：inventory 的 4 个弹窗 state 需重构为 `ref<{open(): void}>` + `@change` 回写。其余页面无弹窗，不受影响。
2. **uni-easyinput 的 v-model** 在某些版本需 `@input` 同步，验证时注意。
3. **uni-card 的 slot** 结构（title/extra 默认 slot）与 PanelCard 略不同，内容布局可能需微调。
4. **小程序兼容**：uni-ui 跨端，H5 + mp-weixin 都支持。

## 执行顺序
1. 安装 uni-ui + easycom 配置
2. 改 inventory（最复杂，含 Popup→uni-popup）
3. 改其余 9 页面（PanelCard→uni-card, input→uni-easyinput, notice→uni-tag）
4. 删 PanelCard.vue / Popup.vue
5. 清理 App.vue 样式
6. `build:h5` + `build:mp-weixin` 验证

## 验收
- H5 全 10 页面渲染正常，弹窗/表单/列表交互正常
- 小程序编译通过
- 无 PanelCard/Popup 残留引用
