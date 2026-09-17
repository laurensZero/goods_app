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
import { ntpBridgePlugin } from './scripts/vite-plugin-ntp-bridge.mjs'
import {
  isAllowedBilibiliMediaHost,
  rememberBilibiliMediaHostsFromPlayurl
} from './scripts/bilibili-media-allowlist.mjs'

// ONNX Runtime 与 wasm 均不进静态包：imgly 的 `import("onnxruntime-web")`
// 直接外链到 CDN（见 ortCdnPlugin），不再经带顶层 await 的中间 loader。
// 这里兜底删掉任何仍被 rollup 打出的 ort 产物，避免 APK 膨胀。
const ORT_CDN_ENTRIES = {
  'onnxruntime-web': 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/ort.bundle.min.mjs',
  'onnxruntime-web/webgpu': 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/ort.webgpu.bundle.min.mjs'
}

function ortCdnPlugin() {
  return {
    name: 'ort-cdn-external',
    enforce: 'pre',
    resolveId(source) {
      const url = ORT_CDN_ENTRIES[source]
      // 浏览器原生动态 import 绝对 URL；不进 bundle，也无需顶层 await
      if (url) return { id: url, external: true }
      return null
    }
  }
}
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
          .filter((fileName) => /^(ort-wasm-.*\.wasm|ort\..*\.mjs|ort\..*\.js|ort\.bundle.*)$/.test(fileName))
          .map((fileName) => unlink(join(assetDir, fileName)).catch(() => undefined))
      )
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    ortCdnPlugin(),
    removeBundledCutoutWasm(),
    // MCP dev 服务：AI 客户端经 HTTP 调用 App 收藏数据（token 说明见 scripts/vite-plugin-mcp.mjs）
    mcpDevServerPlugin(process.env.GOODS_MCP_TOKEN, process.env.GOODS_MCP_ALLOW_WRITES === '1'),
    // AI 聊天开发代理：浏览器经 /ai-proxy 转发到用户配置的 OpenAI 兼容端点，绕开 CORS
    aiProxyPlugin(),
    // Dev 本地 SNTP 桥：浏览器请求 /dev-ntp 时才去打阿里云 UDP NTP（按需，不常驻探测）
    ntpBridgePlugin(),
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
        // playurl 会下发动态 CDN 域名（如 mountaintoys 边缘节点）。
        // 在转发前抓一遍 JSON，把媒体 host 写进运行时白名单，避免写死域名被 B 站换掉后 400。
        server.middlewares.use(async (req, res, next) => {
          const rawUrl = req.originalUrl || req.url || ''
          if (!rawUrl.startsWith('/bilibili-api/x/player/playurl')) return next()
          try {
            const requestUrl = new URL(rawUrl, 'http://localhost')
            const target = new URL(`/x/player/playurl${requestUrl.search}`, 'https://api.bilibili.com')
            const upstream = await fetch(target, {
              headers: {
                Referer: 'https://www.bilibili.com/',
                'User-Agent':
                  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
                Accept: '*/*',
                // 禁用压缩，便于直接 JSON.parse 学习 host
                'Accept-Encoding': 'identity'
              }
            })
            const text = await upstream.text()
            try {
              rememberBilibiliMediaHostsFromPlayurl(JSON.parse(text))
            } catch {
              // 非 JSON / 解析失败：仍原样转发，交给客户端
            }
            res.statusCode = upstream.status
            const contentType = upstream.headers.get('content-type')
            if (contentType) res.setHeader('Content-Type', contentType)
            res.end(text)
          } catch (error) {
            // 学习失败不阻断业务：回落到常规代理
            console.warn('[bilibili-media-proxy] playurl 预取失败，回落代理:', error?.message || error)
            next()
          }
        })

        server.middlewares.use('/bilibili-media', async (req, res) => {
          try {
            const requestUrl = new URL(req.url || '', 'http://localhost')
            const targetUrl = requestUrl.searchParams.get('url')
            const target = targetUrl ? new URL(targetUrl) : null
            // 静态后缀 + playurl 动态登记的 host；仍拒绝内网地址，避免开放代理被滥用。
            // 白名单过窄会让 /bilibili-media 直接 400，
            // 浏览器端表现为 MEDIA_ERR_SRC_NOT_SUPPORTED（no supported source）。
            if (!target || !isAllowedBilibiliMediaHost(target.hostname)) {
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
    alias: [
      // @ 指向 src，方便路径引用
      {
        find: '@',
        replacement: fileURLToPath(new URL('./src', import.meta.url))
      }
    ]
  },
  // Dev/dep 预构建同样允许顶层 await（与 build.target 对齐）
  esbuild: {
    target: 'es2022'
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022'
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
            // 积分商城列表接口要求移动端请求特征；浏览器无法自设 UA，由代理补齐
            if (String(req.url || '').includes('/common/hm_app/v1/goods/point_goods_list')) {
              proxyReq.setHeader(
                'user-agent',
                'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
              )
              proxyReq.setHeader('referer', 'https://mihoyogift.com/m/point')
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
    // 允许顶层 await / 现代语法（含残留依赖产物）
    target: 'es2022',
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
