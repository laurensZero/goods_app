import { describe, it, expect, vi } from 'vitest'
import { renderMarkdown, detectMarkdownContent, mountBiliEmbedEnhancers } from '../markdown'
import { fetchBilibiliVideoMeta } from '../music/bilibiliMusic'

vi.mock('../music/bilibiliMusic', () => ({
  fetchBilibiliVideoMeta: vi.fn(async (bvid) => {
    if (bvid === 'BV1single000') {
      return { pages: [{ page: 1, part: '仅第一P', durationMs: 60000 }] }
    }
    if (bvid === 'BV1fail00000') throw new Error('network down')
    return {
      pages: [
        { page: 1, part: '第一P', durationMs: 60000 },
        { page: 2, part: '第二P', durationMs: 90000 },
        { page: 3, part: '第三P', durationMs: 120000 }
      ]
    }
  })
}))

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

  it('accepts full bilibili video URLs and drops non-whitelisted share params', async () => {
    const html = await renderMarkdown(
      '<video>https://www.bilibili.com/video/BV1GJ411x7h7/?p=2&spm_id_from=333.999</video>'
    )
    expect(html).toContain('bvid=BV1GJ411x7h7')
    expect(html).toContain('page=2&amp;p=2')
    // 模型/分享链接带来的杂参数不再透传（autoplay 等可能覆盖 app 的固定播放策略）
    expect(html).not.toContain('spm_id_from')
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

  it('bakes data-bvid / data-page onto the container and wraps the iframe in a stage', async () => {
    const html = await renderMarkdown('<video>BV1xx411c7mD?p=2</video>')
    expect(html).toContain('class="bili-embed" data-bvid="BV1xx411c7mD" data-page="2"')
    expect(html).toContain('bili-embed__stage')
  })
})

describe('renderMarkdown bilibili page switcher', () => {
  it('mounts P buttons outside the iframe for multi-P videos and switches page on click', async () => {
    const html = await renderMarkdown('<video>BV1xx411c7mD?p=2</video>')
    const host = document.createElement('div')
    host.innerHTML = html
    mountBiliEmbedEnhancers(host)

    await vi.waitFor(() => {
      expect(host.querySelectorAll('.bili-embed__page').length).toBe(3)
    })

    const container = host.querySelector('.bili-embed')
    const buttons = Array.from(host.querySelectorAll('.bili-embed__page'))
    expect(buttons.map((button) => button.textContent)).toEqual(['P1', 'P2', 'P3'])
    expect(buttons[1].classList.contains('is-active')).toBe(true)
    expect(buttons[1].getAttribute('aria-current')).toBe('true')

    buttons[0].click()
    const iframe = container.querySelector('.bili-embed__frame')
    expect(iframe.getAttribute('src')).toContain('page=1&p=1')
    expect(iframe.getAttribute('src')).not.toContain('page=2')
    expect(container.getAttribute('data-page')).toBe('1')
    expect(buttons[0].classList.contains('is-active')).toBe(true)
    expect(buttons[1].classList.contains('is-active')).toBe(false)
  })

  it('does not mount a switcher for single-P videos', async () => {
    const html = await renderMarkdown('<video>BV1single000</video>')
    const host = document.createElement('div')
    host.innerHTML = html
    mountBiliEmbedEnhancers(host)

    await vi.waitFor(() => {
      expect(fetchBilibiliVideoMeta).toHaveBeenCalledWith('BV1single000')
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(host.querySelector('.bili-embed__pages')).toBeNull()
  })

  it('keeps the plain embed when meta fetch fails', async () => {
    const html = await renderMarkdown('<video>BV1fail00000</video>')
    const host = document.createElement('div')
    host.innerHTML = html
    mountBiliEmbedEnhancers(host)

    await vi.waitFor(() => {
      expect(fetchBilibiliVideoMeta).toHaveBeenCalledWith('BV1fail00000')
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(host.querySelector('.bili-embed')).toBeTruthy()
    expect(host.querySelector('.bili-embed__pages')).toBeNull()
  })
})
