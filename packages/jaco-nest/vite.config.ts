import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import Uni from '@uni-helper/plugin-uni'
import UniHelperComponents from '@uni-helper/vite-plugin-uni-components'
import UniHelperLayouts from '@uni-helper/vite-plugin-uni-layouts'
import UniHelperManifest from '@uni-helper/vite-plugin-uni-manifest'
import UniHelperPages from '@uni-helper/vite-plugin-uni-pages'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { defineConfig } from 'vite'
import UniPolyfill from 'vite-plugin-uni-polyfill'

function toKebabCase(name: string) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function resolveUniModule(name: string) {
  if (!name.startsWith('Uni'))
    return

  const componentName = toKebabCase(name)
  const source = `src/uni_modules/${componentName}/${componentName}.vue`
  if (!existsSync(resolve(process.cwd(), source)))
    return

  return {
    name,
    from: `@/uni_modules/${componentName}/${componentName}.vue`,
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  css: {
    preprocessorOptions: {
      scss: {
        // 当前 uni-app 依赖的 Vite 5.2 内部仍调用 Sass legacy API；静默其已知弃用提示。
        silenceDeprecations: ['legacy-js-api'],
      },
    },
  },
  plugins: [
    // https://uni-helper.js.org/vite-plugin-uni-manifest
    UniHelperManifest(),
    // https://uni-helper.js.org/vite-plugin-uni-pages
    UniHelperPages({
      dts: 'src/uni-pages.d.ts',
    }),
    // https://uni-helper.js.org/vite-plugin-uni-layouts
    UniHelperLayouts(),
    // https://uni-helper.js.org/vite-plugin-uni-components
    UniHelperComponents({
      dts: 'src/components.d.ts',
      directoryAsNamespace: true,
      resolvers: [resolveUniModule],
    }),
    // https://uni-helper.js.org/plugin-uni
    Uni(),
    UniPolyfill(),
    // https://github.com/antfu/unplugin-auto-import
    AutoImport({
      imports: ['vue', '@vueuse/core', 'uni-app', 'pinia'],
      dts: 'src/auto-imports.d.ts',
      dirs: ['src/composables', 'src/stores', 'src/utils'],
      vueTemplate: true,
    }),
    // https://github.com/antfu/unocss
    // see unocss.config.ts for config
    UnoCSS(),
  ],
})
