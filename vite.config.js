import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isNative = mode === 'native'
  return {
  plugins: [vue()],
  // Capacitor 打包时从 file:// 协议加载，必须用相对路径
  base: './',
  define: {
    __PLATFORM__: JSON.stringify(isNative ? 'native' : 'web')
  },
  resolve: {
    alias: {
      // @ 指向 src，方便路径引用
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // 编译时根据 mode 选择数据库适配器，tree-shaking 自动排除未使用的适配器
      '@dbAdapter': fileURLToPath(new URL(
        isNative ? './src/utils/dbNativeAdapter.js' : './src/utils/dbWebAdapter.js',
        import.meta.url
      ))
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
        rewrite: (path) => path.replace(/^\/mihoyo-api/, ''),
        configure: (proxy) => {
          // 浏览器禁止 JS 设置 Cookie 头（Forbidden Header），
          // 通过自定义 x-cookie-forward 头在 Vite 代理侧转换
          proxy.on('proxyReq', (proxyReq, req) => {
            const fwd = req.headers['x-cookie-forward']
            if (fwd) {
              proxyReq.setHeader('cookie', decodeURIComponent(fwd))
              proxyReq.removeHeader('x-cookie-forward')
            }
          })
        }
      },
      '/netease-api': {
        target: 'https://music.163.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/netease-api/, ''),
        headers: {
          Referer: 'https://music.163.com/'
        }
      },
      '/mihoyo-static': {
        target: 'https://sdk-webstatic.mihoyo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mihoyo-static/, '')
      },
      '/github-oauth': {
        target: 'https://github.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/github-oauth/, '')
      },
      '/exchange-rate-api': {
        target: 'https://api.frankfurter.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/exchange-rate-api/, '')
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          'ui-library': ['vant'],
          'mobile-core': ['@capacitor/core', '@capacitor/app', '@capacitor/filesystem', '@capacitor/preferences']
        }
      }
    }
  }
  }
})
