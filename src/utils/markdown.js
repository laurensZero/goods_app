import DOMPurify from 'dompurify'

const BILI_TOKEN_RE = /<video>\s*(BV[0-9A-Za-z]+(?:\?[^\n<]*)?)\s*<\/video>/gi
const BILI_TOKEN_PREFIX = '@@BILIEMBED'
const BILI_TOKEN_SUFFIX = '@@'

function extractBiliTokens(src) {
  const ids = []
  const replaced = src.replace(BILI_TOKEN_RE, (match, id) => {
    const token = `${BILI_TOKEN_PREFIX}${ids.length}${BILI_TOKEN_SUFFIX}`
    ids.push(id)
    return token
  })
  return { replaced, ids }
}

function buildBiliEmbed(id) {
  let bvid = id
  let query = ''
  const qIdx = id.indexOf('?')
  if (qIdx !== -1) {
    bvid = id.slice(0, qIdx)
    query = id.slice(qIdx + 1)
  }
  const params = new URLSearchParams()
  query.split('&').forEach((pair) => {
    if (!pair) return
    const eq = pair.indexOf('=')
    if (eq === -1) {
      params.append(pair, '')
    } else {
      params.append(pair.slice(0, eq), pair.slice(eq + 1))
    }
  })
  const extra = params.toString() ? `&${params.toString()}` : ''
  const src = `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}&page=1&autoplay=0&danmaku=0&isOutside=true&high_quality=1&poster=1${extra}`
  return `<div class="bili-embed"><iframe class="bili-embed__frame" src="${src}" sandbox="allow-scripts allow-same-origin allow-presentation" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe></div>`
}

// Only allow iframes pointing at the official Bilibili player, drop anything else.
DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName === 'iframe') {
    const src = node.getAttribute('src') || ''
    if (!/^https:\/\/player\.bilibili\.com\//.test(src)) {
      if (node.parentNode) node.parentNode.removeChild(node)
    }
  }
})

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
    /<video>\s*BV[0-9A-Za-z]+/i
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
  return mdInstance
}

export async function renderMarkdown(value) {
  const md = await getMarkdownIt()
  const src = String(value || '')
  const { replaced, ids } = extractBiliTokens(src)
  let rendered = md.render(replaced)
  ids.forEach((id, i) => {
    rendered = rendered.split(`${BILI_TOKEN_PREFIX}${i}${BILI_TOKEN_SUFFIX}`).join(buildBiliEmbed(id))
  })
  return DOMPurify.sanitize(rendered, {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allowfullscreen', 'frameborder', 'scrolling', 'framespacing', 'border', 'sandbox']
  })
}