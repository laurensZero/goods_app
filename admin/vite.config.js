import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  // 部署到 GitHub Pages 子路径 /admin/ ，使用相对路径确保任意子路径可用
  base: './',
  server: {
    host: '0.0.0.0', // 允许局域网访问预览
    port: 5140, // 主应用 dev 占用 5173，管理台独立端口避免冲突
    strictPort: true
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // 管理台是独立部署的静态站点，直接打包成单个可分发目录
    chunkSizeWarningLimit: 900
  }
})