import { describe, it, expect } from 'vitest'
import {
  extractTaobaoItemId,
  isTaobaoItemUrl,
  normalizeCdnUrl,
  extractSsrRes,
  buildTaobaoDraft,
  buildTaobaoItemUrl,
} from '../detail'

/** 构造一段结构与线上一致的 SSR HTML */
function makeHtml(res) {
  const b = { appData: null, loaderData: { home: { data: { res } } } }
  return `<!DOCTYPE html><html><head></head><body><script>var b = ${JSON.stringify(b)};</script></body></html>`
}

const sampleRes = {
  item: {
    itemId: '1026022602471',
    title: '《二次元凶》 hanser第二张个人EP专辑 大版/小版',
    vagueSellCount: '1000+',
    images: [
      'https://img.alicdn.com/imgextra/i2/2214218277756/detail1.jpg',
      'https://img.alicdn.com/imgextra/i2/2214218277756/detail2.jpg',
    ],
  },
  seller: { sellerNick: '卖碟开店7615', shopName: '卖碟开店', pcShopUrl: '//shop272582525.taobao.com' },
  componentsVO: {
    headImageVO: {
      images: [
        'https://img.alicdn.com/imgextra/i4/2214218277756/main1.png',
        'https://img.alicdn.com/imgextra/i4/2214218277756/main2.png',
      ],
    },
    titleVO: { salesDesc: '已售 1000+' },
    storeCardVO: { shopName: '卖碟开店', shopUrl: 'https://shop272582525.taobao.com/category.htm' },
    priceVO: { price: { priceText: '125', priceDesc: '起', priceMoney: '12500' } },
  },
  skuBase: {
    skus: [
      { propPath: '-1:-1', skuId: '6037939965245' },
      { propPath: '-1:-2', skuId: '6037939965246' },
    ],
    props: [
      {
        pid: '-1',
        name: '商品规格',
        values: [
          { vid: '-1', name: '大版', image: 'https://gw.alicdn.com/bao/uploaded/i4/big.png' },
          { vid: '-2', name: '小版', image: 'https://gw.alicdn.com/bao/uploaded/i4/small.png' },
        ],
        valueMap: {
          '-1': { vid: '-1', name: '大版', image: 'https://gw.alicdn.com/bao/uploaded/i4/big.png' },
          '-2': { vid: '-2', name: '小版', image: 'https://gw.alicdn.com/bao/uploaded/i4/small.png' },
        },
      },
    ],
  },
  skuCore: {
    sku2info: {
      0: { price: { priceText: '125', priceDesc: '起' }, quantity: 200 },
      '6037939965245': { price: { priceText: '155' }, quantity: 200, logisticsTime: '预售，20天内发货' },
      '6037939965246': { price: { priceText: '125' }, quantity: 200, logisticsTime: '预售，20天内发货' },
    },
  },
}

describe('extractTaobaoItemId', () => {
  it('识别 PC / 天猫 / H5 链接', () => {
    expect(extractTaobaoItemId('https://item.taobao.com/item.htm?id=1026022602471')).toBe('1026022602471')
    expect(extractTaobaoItemId('https://detail.tmall.com/item.htm?id=1026022602471&spm=a217e')).toBe('1026022602471')
    expect(extractTaobaoItemId('https://h5.m.taobao.com/awp/core/detail.htm?id=1026022602471')).toBe('1026022602471')
    expect(extractTaobaoItemId('item.taobao.com/item.htm?id=1026022602471')).toBe('1026022602471')
    expect(extractTaobaoItemId('1026022602471')).toBe('1026022602471')
  })

  it('无法识别时返回空串', () => {
    expect(extractTaobaoItemId('')).toBe('')
    expect(extractTaobaoItemId('https://item.taobao.com/item.htm')).toBe('')
    expect(extractTaobaoItemId('hello world')).toBe('')
  })
})

describe('isTaobaoItemUrl', () => {
  it('识别域名与短链', () => {
    expect(isTaobaoItemUrl('https://item.taobao.com/item.htm?id=1')).toBe(true)
    expect(isTaobaoItemUrl('https://detail.tmall.com/item.htm?id=1')).toBe(true)
    expect(isTaobaoItemUrl('https://m.tb.cn/abc123')).toBe(true)
    expect(isTaobaoItemUrl('https://example.com/item.htm?id=1')).toBe(false)
  })
})

describe('normalizeCdnUrl', () => {
  it('补全协议并统一为 https', () => {
    expect(normalizeCdnUrl('//img.alicdn.com/a.png')).toBe('https://img.alicdn.com/a.png')
    expect(normalizeCdnUrl('http://img.alicdn.com/a.png')).toBe('https://img.alicdn.com/a.png')
    expect(normalizeCdnUrl('img.alicdn.com/a.png')).toBe('https://img.alicdn.com/a.png')
    expect(normalizeCdnUrl('')).toBe('')
    expect(normalizeCdnUrl('data:image/png;base64,xxx')).toBe('')
  })

  it('搜索 CDN 域证书不匹配时换到 g-search1.alicdn.com', () => {
    expect(normalizeCdnUrl('//g.search.alicdn.com/img/a.jpg')).toBe('https://g-search1.alicdn.com/img/a.jpg')
    expect(normalizeCdnUrl('http://g.search.alicdn.com/img/a.jpg')).toBe('https://g-search1.alicdn.com/img/a.jpg')
    expect(normalizeCdnUrl('g.search.alicdn.com/img/a.jpg')).toBe('https://g-search1.alicdn.com/img/a.jpg')
    expect(normalizeCdnUrl('https://g.search.alicdn.com/img/a.jpg?x-oss-process=image/resize,w_200')).toBe(
      'https://g-search1.alicdn.com/img/a.jpg?x-oss-process=image/resize,w_200',
    )
    // 路径里出现该域名、或其他 alicdn 子域时不改写
    expect(normalizeCdnUrl('//img.alicdn.com/g.search.alicdn.com/a.png')).toBe('https://img.alicdn.com/g.search.alicdn.com/a.png')
    expect(normalizeCdnUrl('//gw.alicdn.com/x.jpg')).toBe('https://gw.alicdn.com/x.jpg')
  })

  it('search3 等多级搜索 CDN 域同样改写（证书 SAN 不覆盖）', () => {
    expect(normalizeCdnUrl('//g.search3.alicdn.com/img/i3/a.jpg')).toBe('https://g-search1.alicdn.com/img/i3/a.jpg')
    expect(normalizeCdnUrl('https://g.search3.alicdn.com/img/i3/a.jpg?x-oss-process=image/resize,w_200')).toBe(
      'https://g-search1.alicdn.com/img/i3/a.jpg?x-oss-process=image/resize,w_200',
    )
    expect(normalizeCdnUrl('https://search5.alicdn.com/b.jpg')).toBe('https://g-search1.alicdn.com/b.jpg')
    // 已改写域与普通域不受影响
    expect(normalizeCdnUrl('https://g-search1.alicdn.com/a.jpg')).toBe('https://g-search1.alicdn.com/a.jpg')
    expect(normalizeCdnUrl('https://img.alicdn.com/img/i3/a.jpg')).toBe('https://img.alicdn.com/img/i3/a.jpg')
  })
})

describe('extractSsrRes', () => {
  it('从 var b = {…} 提取 res', () => {
    const res = extractSsrRes(makeHtml(sampleRes))
    expect(res.item.title).toContain('二次元凶')
  })

  it('JSON 字符串里出现 }; 不会截断', () => {
    const tricky = { ...sampleRes, item: { ...sampleRes.item, title: '含 }; 的标题' } }
    expect(extractSsrRes(makeHtml(tricky)).item.title).toBe('含 }; 的标题')
  })

  it('登录壳 / 空页面返回 null', () => {
    expect(extractSsrRes('<html>login</html>')).toBeNull()
    expect(extractSsrRes('')).toBeNull()
  })

  it('loaderData 键不是 home 时也能兜到', () => {
    const b = { loaderData: { detail: { data: { res: sampleRes } } } }
    const html = `<script>var b = ${JSON.stringify(b)};</script>`
    expect(extractSsrRes(html).item.itemId).toBe('1026022602471')
  })
})

describe('buildTaobaoDraft', () => {
  it('映射标题/价格/主图/详情图/SKU/店铺', () => {
    const draft = buildTaobaoDraft(sampleRes, { url: buildTaobaoItemUrl('1026022602471') })

    expect(draft.title).toBe('《二次元凶》 hanser第二张个人EP专辑 大版/小版')
    expect(draft.itemId).toBe('1026022602471')
    expect(draft.price).toBe('')
    expect(draft.priceRange).toBe(true)
    expect(draft.priceText).toBe('125')
    expect(draft.images).toEqual([
      'https://img.alicdn.com/imgextra/i4/2214218277756/main1.png',
      'https://img.alicdn.com/imgextra/i4/2214218277756/main2.png',
    ])
    expect(draft.detailImages).toEqual([
      'https://img.alicdn.com/imgextra/i2/2214218277756/detail1.jpg',
      'https://img.alicdn.com/imgextra/i2/2214218277756/detail2.jpg',
    ])
    expect(draft.images).not.toEqual(draft.detailImages)
    expect(draft.shopName).toBe('卖碟开店')
    expect(draft.sellCount).toBe('1000+')
    expect(draft.url).toBe('https://item.taobao.com/item.htm?id=1026022602471')

    expect(draft.skus).toHaveLength(2)
    expect(draft.skus[0]).toMatchObject({ name: '大版', price: '155', image: 'https://gw.alicdn.com/bao/uploaded/i4/big.png' })
    expect(draft.skus[1]).toMatchObject({ name: '小版', price: '125' })
  })

  it('单一价格商品不做区间标记', () => {
    const res = {
      ...sampleRes,
      componentsVO: { ...sampleRes.componentsVO, priceVO: { price: { priceText: '39.9' } } },
    }
    const draft = buildTaobaoDraft(res)
    expect(draft.price).toBe('39.9')
    expect(draft.priceRange).toBe(false)
  })

  it('缺主图时退化到 SKU 图', () => {
    const res = {
      ...sampleRes,
      componentsVO: { ...sampleRes.componentsVO, headImageVO: { images: [] } },
    }
    const draft = buildTaobaoDraft(res)
    expect(draft.images).toEqual(['https://gw.alicdn.com/bao/uploaded/i4/big.png'])
  })

  it('标题缺失返回 null', () => {
    expect(buildTaobaoDraft({ item: {} })).toBeNull()
    expect(buildTaobaoDraft(null)).toBeNull()
  })
})
