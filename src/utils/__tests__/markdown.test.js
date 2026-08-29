import { describe, it, expect } from 'vitest'
import { renderMarkdown, detectMarkdownContent } from '../markdown'

describe('renderMarkdown bilibili embed', () => {
  it('renders <video>BVxxx</video> as an iframe to player.bilibili.com', async () => {
    const html = await renderMarkdown('see <video>BV1xx411c7mD</video> here')
    expect(html).toContain('class="bili-embed"')
    expect(html).toContain('https://player.bilibili.com/player.html?bvid=BV1xx411c7mD&amp;page=1&amp;autoplay=0&amp;danmaku=0&amp;isOutside=true&amp;high_quality=1&amp;poster=1')
    expect(html).toContain('<iframe')
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-presentation"')
  })

  it('passes through extra query params safely', async () => {
    const html = await renderMarkdown('<video>BV1xx411c7mD?p=2&t=30</video>')
    expect(html).toContain('bvid=BV1xx411c7mD')
    expect(html).toContain('p=2')
    expect(html).toContain('t=30')
  })

  it('does not render arbitrary iframe sources', async () => {
    const html = await renderMarkdown('<video>BV1xx411c7mD</video>')
    expect(html).not.toContain('evil.com')
    expect(html).not.toContain('onload')
  })

  it('blocks top navigation / popups via sandbox', async () => {
    const html = await renderMarkdown('<video>BV1xx411c7mD</video>')
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-presentation"')
    expect(html).not.toContain('allow-top-navigation')
    expect(html).not.toContain('allow-popups')
  })

  it('detects bilibili video syntax as markdown content', () => {
    expect(detectMarkdownContent('hello <video>BV1xx411c7mD</video>')).toBe(true)
  })
})
