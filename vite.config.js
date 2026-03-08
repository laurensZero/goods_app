import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  // Capacitor 打包时从 file:// 协议加载，必须用相对路径
  base: './',
  resolve: {
    alias: {
      // @ 指向 src，方便路径引用
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: '0.0.0.0', // 允许局域网手机访问预览
    port: 5173,
    proxy: {
      // 开发环境代理：绕过浏览器 CORS 限制，转发到米游铺 API
      '/mihoyo-api': {
        target: 'https://api-mall.mihoyogift.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mihoyo-api/, '')
      }
    }
  },
  // jeep-sqlite 使用动态 import + Worker，需排除预构建优化
  optimizeDeps: {
    exclude: ['@capacitor-community/sqlite']
  }
})
