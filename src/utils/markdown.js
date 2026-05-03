import MarkdownIt from 'markdown-it'
import mkTask from 'markdown-it-task-lists'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'

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

const md = new MarkdownIt({
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
      return `<pre><code>${md.utils.escapeHtml(str)}</code></pre>`
    }
  }
})
md.use(mkTask, { enabled: true })

export function renderMarkdown(value) {
  const src = String(value || '')
  const rendered = md.render(src)
  try {
    return DOMPurify.sanitize(rendered)
  } catch (e) {
    return rendered
  }
}