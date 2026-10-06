import { JUMP_HREF_PREFIX } from './ai/jumpLinks'
import { getCachedImageThumb } from './image/thumb'

// 同时接受裸 BV 号和完整 bilibili 视频链接（含分享参数）
const BILI_TOKEN_RE = /<video>\s*([^\n<]*BV[0-9A-Za-z]{10}[^\n<]*)\s*<\/video>/gi
const BILI_TOKEN_PREFIX = '@@BILIEMBED'
const BILI_TOKEN_SUFFIX = '@@'

function extractBiliTokens(src) {
  const ids = []
  const replaced = src.replace(BILI_TOKEN_RE, (match, id) => {
    // 提取不到 BV 号的内容原样保留，不渲染成空 iframe
    if (!/BV[0-9A-Za-z]{10}/i.test(id)) return match
    const token = `${BILI_TOKEN_PREFIX}${ids.length}${BILI_TOKEN_SUFFIX}`
    ids.push(id)
    return token
  })
  return { replaced, ids }
}

function buildBiliEmbed(id) {
  const bvidMatch = id.match(/BV[0-9A-Za-z]{10}/i)
  if (!bvidMatch) return ''
  const bvid = bvidMatch[0]
  const qIdx = id.indexOf('?')
  const params = new URLSearchParams(qIdx === -1 ? '' : id.slice(qIdx + 1))
  // p / page 统一成同一个页码，只输出同值的一组，避免两参数冲突后播放器取错
  const page = Math.max(1, Math.round(Number(params.get('p') || params.get('page')) || 1))
  params.delete('p')
  params.delete('page')
  const extra = params.toString() ? `&${params.toString()}` : ''
  const src = `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}&page=${page}&p=${page}&autoplay=0&danmaku=0&isOutside=true&poster=1${extra}`
  return `<div class="bili-embed"><iframe class="bili-embed__frame" src="${src}" sandbox="allow-scripts allow-same-origin allow-presentation" scrolling="no" border="0" frameborder="0" framespacing="0" allowfullscreen="true"></iframe></div>`
}

// DOMPurify 与 markdown-it 一样按需加载，避免法律弹窗/详情页把净化器打进首包
let domPurifyPromise = null
let domPurifyReady = false

async function getDomPurify() {
  if (!domPurifyPromise) {
    domPurifyPromise = import('dompurify').then(({ default: DOMPurify }) => {
      if (!domPurifyReady) {
        // Only allow iframes pointing at the official Bilibili player, drop anything else.
        DOMPurify.addHook('uponSanitizeElement', (node, data) => {
          if (data.tagName === 'iframe') {
            const src = node.getAttribute('src') || ''
            if (!/^https:\/\/player\.bilibili\.com\//.test(src)) {
              if (node.parentNode) node.parentNode.removeChild(node)
            }
          }
        })
        domPurifyReady = true
      }
      return DOMPurify
    })
  }
  return domPurifyPromise
}

export function detectMarkdownContent(value) {
  const text = String(value || '').trim()
  if (!text) return false

  return [
    /^(#{1,6})\s+.+/m,
    /^\s*[-*+]\s+.+/m,
    /^\s*\d+\.\s+.+/m,
    /^>\s?.+/m,
    /^(-{3,}|\*{3,}|_{3,})$/m,
    /^```/m,
    /\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/,
    /(^|[^*])\*\*[^*\n]+\*\*(?!\*)/,
    /(^|[^_])__[^_\n]+__(?!_)/,
    /(^|[^~])~~[^~\n]+~~/,
    /(^|[^`])`[^`\n]+`(?!`)/,
    /<video>\s*(?:https?:\/\/)?[^\n<]*?BV[0-9A-Za-z]+/i,
    // Markdown 表格：竖线单元格行 + 随后的分隔行（|---|:---:| 等）
    /^\s*\|.+\|?\s*\r?\n\s*\|?[\s:|-]+-[\s:|-]*/
  ].some((pattern) => pattern.test(text))
}

let mdInstance = null

async function getMarkdownIt() {
  if (mdInstance) return mdInstance

  const [
    { default: MarkdownIt },
    { default: mkTask },
    { default: hljs }
  ] = await Promise.all([
    import('markdown-it'),
    import('markdown-it-task-lists'),
    import('highlight.js/lib/common')
  ])

  mdInstance = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    highlight: (str, lang) => {
      try {
        if (lang && hljs.getLanguage(lang)) {
          return `<pre><code class="hljs">${hljs.highlight(str, { language: lang }).value}</code></pre>`
        }
        const res = hljs.highlightAuto(str)
        return `<pre><code class="hljs">${res.value}</code></pre>`
      } catch (e) {
        return `<pre><code>${mdInstance.utils.escapeHtml(str)}</code></pre>`
      }
    }
  })
  mdInstance.use(mkTask, { enabled: true })

  // app:// 跳转按钮：AI 约定协议链接渲染成按钮样式，点击由 AiChatPanel 拦截跳转
  const defaultLinkOpen = mdInstance.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))
  mdInstance.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = String(tokens[idx]?.attrGet('href') || '')
    if (href.startsWith(JUMP_HREF_PREFIX)) {
      tokens[idx].attrJoin('class', 'chat-jump-btn')
      tokens[idx].attrSet('data-jump', '1')
    }
    return defaultLinkOpen(tokens, idx, options, env, self)
  }
  return mdInstance
}

export async function renderMarkdown(value) {
  const [md, DOMPurify] = await Promise.all([getMarkdownIt(), getDomPurify()])
  const src = String(value || '')
  const { replaced, ids } = extractBiliTokens(src)
  let rendered = md.render(replaced)
  ids.forEach((id, i) => {
    rendered = rendered.split(`${BILI_TOKEN_PREFIX}${i}${BILI_TOKEN_SUFFIX}`).join(buildBiliEmbed(id))
  })
  return DOMPurify.sanitize(rendered, {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allowfullscreen', 'frameborder', 'scrolling', 'framespacing', 'border', 'sandbox', 'data-jump'],
    // 默认白名单只放行 http/https/mailto 等，这里加上 app:// 跳转协议
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|app):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
  })
}
/**
 * 渲染 markdown 并把正文里的图片（AI 贴的活动照片/谷子图等）换成本地缩略图，
 * 避免聊天里一次性解码多张几 MB 的原图。缩略图走 utils/image/thumb 的
 * 缓存管道（内存 -> 持久层 -> 现场生成），生成失败时保留原图地址。
 * 仅聊天面板使用；其他 markdown 场景仍用 renderMarkdown。
 * @param {string} value
 * @param {{ maxSize?: number }} [options]
 * @returns {Promise<string>}
 */
export async function renderMarkdownWithThumbs(value, options = {}) {
  const html = await renderMarkdown(value)
  if (!html.includes('<img')) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const images = Array.from(doc.querySelectorAll('img[src]'))
  if (images.length === 0) return html
  await Promise.all(images.map(async (img) => {
    const src = img.getAttribute('src') || ''
    if (!src) return
    // 原图地址留给点击放大；缩略图只当列表展示
    img.setAttribute('data-full-src', src)
    try {
      const thumb = await getCachedImageThumb(src, options)
      if (thumb && thumb !== src) img.setAttribute('src', thumb)
    } catch { /* 保留原图地址 */ }
  }))
  return doc.body.innerHTML
}
