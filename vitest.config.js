import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@private': fileURLToPath(new URL('./private/src', import.meta.url))
    }
  },
  test: {
    environment: 'happy-dom',
    environmentOptions: {
      happyDOM: {
        settings: {
          disableIframePageLoading: true,
          fetch: {
            disableSameOriginPolicy: true
          }
        }
      }
    },
    include: [
      'src/**/__tests__/**/*.test.js',
      // 私有扩展测试（目录不存在时匹配为空）
      'private/src/**/__tests__/**/*.test.js'
    ],
    globals: true,
    restoreMocks: true,
  }
})
