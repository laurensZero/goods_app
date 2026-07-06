import DOMPurify from 'dompurify'

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
    /(^|[^`])`[^`\n]+`(?!`)/
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
    import('highlight.js')
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
  const rendered = md.render(src)
  return DOMPurify.sanitize(rendered)
}