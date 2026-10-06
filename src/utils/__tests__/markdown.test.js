import { describe, it, expect } from 'vitest'
import { renderMarkdown, detectMarkdownContent } from '../markdown'

describe('renderMarkdown bilibili embed', () => {
  it('renders <video>BVxxx</video> as an iframe to player.bilibili.com', async () => {
    const html = await renderMarkdown('see <video>BV1xx411c7mD</video> here')
    expect(html).toContain('class="bili-embed"')
    expect(html).toContain('https://player.bilibili.com/player.html?bvid=BV1xx411c7mD&amp;page=1&amp;p=1&amp;autoplay=0&amp;danmaku=0&amp;isOutside=true&amp;poster=1')
    expect(html).toContain('<iframe')
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-presentation"')
  })

  it('passes through extra query params safely', async () => {
    const html = await renderMarkdown('<video>BV1xx411c7mD?t=30</video>')
    expect(html).toContain('bvid=BV1xx411c7mD')
    expect(html).toContain('page=1&amp;p=1')
    expect(html).toContain('t=30')
  })

  it('unifies p / page params into one page number', async () => {
    const html = await renderMarkdown('<video>BV1xx411c7mD?p=2&t=30</video>')
    expect(html).toContain('page=2&amp;p=2')
    expect(html).not.toContain('page=2&amp;p=1')
    expect(html).toContain('t=30')

    const pageParamHtml = await renderMarkdown('<video>BV1xx411c7mD?page=3</video>')
    expect(pageParamHtml).toContain('page=3&amp;p=3')
  })

  it('accepts full bilibili video URLs', async () => {
    const html = await renderMarkdown(
      '<video>https://www.bilibili.com/video/BV1GJ411x7h7/?p=2&spm_id_from=333.999</video>'
    )
    expect(html).toContain('bvid=BV1GJ411x7h7')
    expect(html).toContain('page=2&amp;p=2')
    expect(html).toContain('spm_id_from=333.999')
    expect(detectMarkdownContent('<video>https://www.bilibili.com/video/BV1GJ411x7h7?p=2</video>')).toBe(true)
  })

  it('keeps tokens without a valid BV id untouched', async () => {
    const src = '<video>not-a-video</video>'
    const html = await renderMarkdown(src)
    expect(html).not.toContain('bili-embed')
    expect(html).toContain('not-a-video')
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
    expect(detectMarkdownContent('hello <video>BV1xx411c7mD?p=2</video>')).toBe(true)
  })
})
