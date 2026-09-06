import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from 'unplugin-vue-components/resolvers'
import { readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { mcpDevServerPlugin } from './scripts/vite-plugin-mcp.mjs'
import { aiProxyPlugin } from './scripts/vite-plugin-ai-proxy.mjs'

function removeBundledCutoutWasm() {
  let outputDir = ''
  return {
    name: 'remove-bundled-cutout-wasm',
    enforce: 'post',
    configResolved(config) {
      outputDir = config.build.outDir
    },
    async closeBundle() {
      const assetDir = join(outputDir, 'assets')
      const fileNames = await readdir(assetDir).catch(() => [])
      await Promise.all(
        fileNames
          .filter((fileName) => /^ort-wasm-.*\.wasm$/.test(fileName))
          .map((fileName) => unlink(join(assetDir, fileName)).catch(() => undefined))
      )
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    removeBundledCutoutWasm(),
    // MCP dev 服务：AI 客户端经 HTTP 调用 App 收藏数据（token 说明见 scripts/vite-plugin-mcp.mjs）
    mcpDevServerPlugin(process.env.GOODS_MCP_TOKEN, process.env.GOODS_MCP_ALLOW_WRITES === '1'),
    // AI 聊天开发代理：浏览器经 /ai-proxy 转发到用户配置的 OpenAI 兼容端点，绕开 CORS
    aiProxyPlugin(),
    VueI18nPlugin({
      include: fileURLToPath(new URL('./src/locales/**/*.json', import.meta.url))
    }),
    Components({
      resolvers: [VantResolver()],
      dts: false
    }),
    {
      name: 'bilibili-media-proxy',
      configureServer(server) {
        server.middlewares.use('/bilibili-media', async (req, res) => {
          try {
            const requestUrl = new URL(req.url || '', 'http://localhost')
            const targetUrl = requestUrl.searchParams.get('url')
            const target = targetUrl ? new URL(targetUrl) : null
            if (!target || !/(^|\.)bilivideo\.com$/i.test(target.hostname)) {
              res.statusCode = 400
              res.end('Invalid Bilibili media URL')
              return
            }

            const headers = {
              Referer: 'https://www.bilibili.com/',
              'User-Agent': String(req.headers['user-agent'] || 'Mozilla/5.0')
            }
            if (req.headers.range) headers.Range = String(req.headers.range)
            const upstream = await fetch(target, { headers })
            res.statusCode = upstream.status
            for (const headerName of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
              const value = upstream.headers.get(headerName)
              if (value) res.setHeader(headerName, value)
            }
            if (!upstream.body) {
              res.end()
              return
            }
            const reader = upstream.body.getReader()
            while (true) {
              const chunk = await reader.read()
              if (chunk.done) break
              res.write(Buffer.from(chunk.value))
            }
            res.end()
          } catch (error) {
            res.statusCode = 502
            res.end(String(error?.message || 'Bilibili media proxy failed'))
          }
        })
      }
    }
  ],
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
      '/qqmusic-api': {
        target: 'https://u.y.qq.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/qqmusic-api/, ''),
        headers: {
          Referer: 'https://y.qq.com/'
        }
      },
      '/qqmusic-c': {
        target: 'https://c.y.qq.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/qqmusic-c/, ''),
        headers: {
          Referer: 'https://y.qq.com/'
        }
      },
      '/bilibili-api': {
        target: 'https://api.bilibili.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bilibili-api/, ''),
        headers: {
          Referer: 'https://www.bilibili.com/'
        }
      },
      '/mihoyo-static': {
        target: 'https://sdk-webstatic.mihoyo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mihoyo-static/, '')
      },
      '/exchange-rate-api': {
        target: 'https://api.frankfurter.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/exchange-rate-api/, '')
      }
    }
  },
  build: {
    // 按需生成 sourcemap（BUILD_SOURCEMAP=1 npm run build）：
    // 用于符号化反馈日志里的压缩堆栈；默认关闭，避免 .map 被打进 OTA zip/APK
    sourcemap: process.env.BUILD_SOURCEMAP === '1' ? 'hidden' : false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia', 'vue-i18n'],
          'ui-library': ['vant'],
          'mobile-core': ['@capacitor/core', '@capacitor/app', '@capacitor/filesystem', '@capacitor/preferences', '@capgo/capacitor-updater', '@capawesome/capacitor-file-picker'],
          'db-engine': ['@capacitor-community/sqlite', 'sql.js'],
          'chart-engine': ['echarts'],
          'fabric-engine': ['fabric'],
          'cutout-engine': ['@imgly/background-removal'],
          'sync-engine': ['@supabase/supabase-js'],
          'pinyin-engine': ['pinyin-pro']
        }
      }
    }
  }
})
