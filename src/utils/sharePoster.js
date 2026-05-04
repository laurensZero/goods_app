import QRCode from 'qrcode'
import { getPrimaryGoodsImageUrl } from '@/utils/goodsImages'
import { formatPrice } from '@/utils/format'

const POSTER_WIDTH = 1080
const POSTER_HEIGHT = 1720

function clipRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function safePriceText(item) {
  if (!item) return ''
  if (item.isWishlist) {
    if (item.price !== undefined && item.price !== null && item.price !== '') return `目标 ${formatPrice(item.price)}`
    return '心愿单'
  }

  if (item.actualPrice !== undefined && item.actualPrice !== null && item.actualPrice !== '') {
    return `到手 ${formatPrice(item.actualPrice)}`
  }

  if (item.price !== undefined && item.price !== null && item.price !== '') {
    return formatPrice(item.price)
  }

  return ''
}

/**
 * Build a descriptive meta line for multi-item shares.
 * Summarises common IP, category, and price range across items.
 */
function buildMultiItemMeta(goodsItems) {
  const parts = [`${goodsItems.length} 件`]

  // Common IP: if all items share one IP, show it; otherwise show count
  const ips = [...new Set(goodsItems.map((item) => item.ip).filter(Boolean))]
  if (ips.length === 1) {
    parts.push(ips[0])
  } else if (ips.length > 1) {
    parts.push(`${ips.length} 个 IP`)
  }

  // Common category
  const cats = [...new Set(goodsItems.map((item) => item.category).filter(Boolean))]
  if (cats.length === 1) {
    parts.push(cats[0])
  }

  // Common characters (only if ALL items share exactly the same set)
  const allChars = goodsItems
    .map((item) => (Array.isArray(item.characters) ? item.characters.filter(Boolean) : []))
    .filter((arr) => arr.length > 0)
  if (allChars.length === goodsItems.length) {
    const firstChars = JSON.stringify([...allChars[0]].sort())
    const allSame = allChars.every((chars) => JSON.stringify([...chars].sort()) === firstChars)
    if (allSame && allChars[0].length > 0) {
      parts.push(allChars[0].join('、'))
    }
  }

  // Price range
  const prices = goodsItems
    .map((item) => {
      const p = item.actualPrice || item.price
      return p ? Number.parseFloat(p) : NaN
    })
    .filter((p) => Number.isFinite(p))

  if (prices.length > 1) {
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    if (min === max) {
      parts.push(formatPrice(min))
    } else {
      parts.push(`${formatPrice(min)}~${formatPrice(max)}`)
    }
  } else if (prices.length === 1) {
    parts.push(formatPrice(prices[0]))
  }

  return parts.join(' · ')
}

function drawRoundedCard(ctx, x, y, width, height, radius, fillStyle, strokeStyle = '') {
  ctx.save()
  clipRoundedRect(ctx, x, y, width, height, radius)
  ctx.fillStyle = fillStyle
  ctx.fill()
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle
    ctx.lineWidth = 2
    ctx.stroke()
  }
  ctx.restore()
}

function drawTextLine(ctx, text, x, y, options = {}) {
  const {
    font = '500 32px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
    color = '#111827',
    align = 'left',
    baseline = 'alphabetic'
  } = options
  ctx.save()
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = baseline
  ctx.fillText(text, x, y)
  ctx.restore()
}

function drawMultilineText(ctx, text, x, y, maxWidth, lineHeight, options = {}) {
  const {
    maxLines = 2,
    font = '700 56px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
    color = '#111827'
  } = options

  const content = String(text || '').trim()
  if (!content) return 0

  ctx.save()
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  const chars = [...content]
  const lines = []
  let current = ''
  for (const ch of chars) {
    const next = current + ch
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current)
      current = ch
      if (lines.length >= maxLines) break
    } else {
      current = next
    }
  }
  if (lines.length < maxLines && current) {
    lines.push(current)
  }

  if (lines.length > maxLines) {
    lines.length = maxLines
  }

  if (lines.length === maxLines && chars.join('') !== lines.join('')) {
    const last = lines[maxLines - 1]
    let trimmed = last
    while (trimmed && ctx.measureText(`${trimmed}...`).width > maxWidth) {
      trimmed = trimmed.slice(0, -1)
    }
    lines[maxLines - 1] = `${trimmed}...`
  }

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, y + i * lineHeight)
  }
  ctx.restore()

  return lines.length
}
function loadImage(url) {
  return new Promise((resolve, reject) => {
    if (!url) return reject(new Error('empty image url'))
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(new Error('failed to load image'))
    img.src = url
  })
}

async function drawOverlayBadge(ctx, x, y, w, h, radius, extra) {
  ctx.save()
  ctx.fillStyle = 'rgba(15, 23, 42, 0.68)'
  clipRoundedRect(ctx, x, y, w, h, radius)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 36px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`+${extra}`, x + w / 2, y + h / 2 - 4)
  ctx.font = '500 18px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif'
  ctx.fillText('件', x + w / 2, y + h / 2 + 22)
  ctx.restore()
}

async function drawGoodsThumb(ctx, item, x, y, w, h, radius) {
  drawRoundedCard(ctx, x, y, w, h, radius, '#ffffff', 'rgba(15, 23, 42, 0.06)')

  const cover = getPrimaryGoodsImageUrl(item?.images, item?.coverImage || item?.image || '')
  if (!cover) {
    ctx.save()
    ctx.fillStyle = '#d1d5db'
    ctx.font = `600 ${Math.floor(h / 3)}px "PingFang SC", "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText((item?.name || '?').charAt(0).toUpperCase(), x + w / 2, y + h / 2)
    ctx.restore()
    return
  }

  try {
    const img = await loadImage(cover)
    const ratio = Math.max(w / img.width, h / img.height)
    const drawW = img.width * ratio
    const drawH = img.height * ratio
    const drawX = x + (w - drawW) / 2
    const drawY = y + (h - drawH) / 2

    ctx.save()
    clipRoundedRect(ctx, x, y, w, h, radius)
    ctx.clip()
    ctx.drawImage(img, drawX, drawY, drawW, drawH)
    ctx.restore()
  } catch {
    ctx.save()
    ctx.fillStyle = '#d1d5db'
    ctx.font = `600 ${Math.floor(h / 3)}px "PingFang SC", "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText((item?.name || '?').charAt(0).toUpperCase(), x + w / 2, y + h / 2)
    ctx.restore()
  }
}

async function drawHeroGrid(ctx, goodsItems = [], x = 120, y = 228, w = 840, h = 840) {
  const gap = 16
  const total = goodsItems.length

  if (total === 2) {
    const thumbW = Math.floor((w - gap) / 2)
    for (let i = 0; i < 2; i++) {
      await drawGoodsThumb(ctx, goodsItems[i], x + i * (thumbW + gap), y, thumbW, h, 20)
    }
    if (total > 2) {
      await drawOverlayBadge(ctx, x + thumbW + gap, y + h - 120, thumbW, 120, 14, total - 2)
    }
    return
  }

  if (total === 3) {
    const leftW = Math.floor((w - gap) * 0.56)
    const rightW = w - leftW - gap
    const rightH = Math.floor((h - gap) / 2)

    await drawGoodsThumb(ctx, goodsItems[0], x, y, leftW, h, 20)
    await drawGoodsThumb(ctx, goodsItems[1], x + leftW + gap, y, rightW, rightH, 16)
    await drawGoodsThumb(ctx, goodsItems[2], x + leftW + gap, y + rightH + gap, rightW, rightH, 16)
    return
  }

  // 2x2 grid for 4+ items
  const cols = 2
  const thumbW = Math.floor((w - gap) / 2)
  const thumbH = Math.floor((h - gap) / 2)
  const showCount = Math.min(total, 4)

  for (let i = 0; i < showCount; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const tx = x + col * (thumbW + gap)
    const ty = y + row * (thumbH + gap)
    await drawGoodsThumb(ctx, goodsItems[i], tx, ty, thumbW, thumbH, 20)
  }

  if (total > 4) {
    const lastCol = (showCount - 1) % cols
    const lastRow = Math.floor((showCount - 1) / cols)
    const bx = x + lastCol * (thumbW + gap)
    const by = y + lastRow * (thumbH + gap)
    await drawOverlayBadge(ctx, bx, by, thumbW, thumbH, 20, total - 4)
  }
}

export async function buildSharePosterDataUrl({ goodsItems, shareUrl, shareCode }) {
  if (!Array.isArray(goodsItems) || goodsItems.length === 0) {
    throw new Error('缺少可分享的谷子数据')
  }
  if (!shareUrl && !shareCode) {
    throw new Error('缺少分享链接')
  }

  const canvas = document.createElement('canvas')
  canvas.width = POSTER_WIDTH
  canvas.height = POSTER_HEIGHT

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('当前环境不支持海报绘制')
  }

  const bg = ctx.createLinearGradient(0, 0, POSTER_WIDTH, POSTER_HEIGHT)
  bg.addColorStop(0, '#f8fafc')
  bg.addColorStop(0.55, '#ffffff')
  bg.addColorStop(1, '#f3f4f6')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)

  const glowA = ctx.createRadialGradient(170, 160, 30, 170, 160, 360)
  glowA.addColorStop(0, 'rgba(96, 165, 250, 0.18)')
  glowA.addColorStop(1, 'rgba(96, 165, 250, 0)')
  ctx.fillStyle = glowA
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)

  const glowB = ctx.createRadialGradient(920, 1240, 80, 920, 1240, 520)
  glowB.addColorStop(0, 'rgba(14, 165, 233, 0.12)')
  glowB.addColorStop(1, 'rgba(14, 165, 233, 0)')
  ctx.fillStyle = glowB
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)

  drawRoundedCard(ctx, 34, 34, POSTER_WIDTH - 68, POSTER_HEIGHT - 68, 44, 'rgba(255, 255, 255, 0.52)', 'rgba(15, 23, 42, 0.08)')

  // App logo — top-right corner
  let logoImg = null
  try {
    logoImg = await loadImage('/favicon.svg')
  } catch {
    // logo not available, continue without it
  }

  if (logoImg) {
    const logoSize = 76
    const logoX = POSTER_WIDTH - 84 - logoSize
    const logoY = 72
    drawRoundedCard(ctx, logoX - 5, logoY - 5, logoSize + 10, logoSize + 10, 20, 'rgba(255,255,255,0.85)', 'rgba(15, 23, 42, 0.06)')
    ctx.save()
    clipRoundedRect(ctx, logoX, logoY, logoSize, logoSize, 17)
    ctx.clip()
    ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize)
    ctx.restore()
  }

  drawTextLine(ctx, '扫码导入到 Goods App', 84, 124, {
    font: '700 42px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
    color: '#0f172a'
  })

  drawTextLine(ctx, `共 ${goodsItems.length} 件 · 扫码或手动输入都能导入`, 84, 176, {
    font: '500 28px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
    color: '#475569'
  })

  const heroX = 120
  const heroY = 228
  const heroW = 840
  const heroH = 840
  drawRoundedCard(ctx, heroX, heroY, heroW, heroH, 40, 'rgba(255,255,255,0.76)', 'rgba(15, 23, 42, 0.08)')

  const firstItem = goodsItems[0] || {}
  // if multiple items, draw a 2x2 hero grid; otherwise draw single hero image/placeholder
  if (goodsItems.length > 1) {
    await drawHeroGrid(ctx, goodsItems, heroX, heroY, heroW, heroH)
  } else {
    const heroCover = getPrimaryGoodsImageUrl(firstItem?.images, firstItem?.coverImage || firstItem?.image || '')
    if (heroCover) {
      try {
        const img = await loadImage(heroCover)
        const ratio = Math.max(heroW / img.width, heroH / img.height)
        const drawW = img.width * ratio
        const drawH = img.height * ratio
        const drawX = heroX + (heroW - drawW) / 2
        const drawY = heroY + (heroH - drawH) / 2

        ctx.save()
        clipRoundedRect(ctx, heroX, heroY, heroW, heroH, 40)
        ctx.clip()
        ctx.drawImage(img, drawX, drawY, drawW, drawH)
        ctx.restore()
      } catch {
        drawRoundedCard(ctx, heroX, heroY, heroW, heroH, 40, '#f1f5f9')
        drawTextLine(ctx, (firstItem?.name || '?').charAt(0).toUpperCase(), heroX + heroW / 2, heroY + heroH / 2, {
          font: '700 140px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
          color: '#cbd5e1',
          align: 'center',
          baseline: 'middle'
        })
      }
    } else {
      drawRoundedCard(ctx, heroX, heroY, heroW, heroH, 40, '#f1f5f9')
      drawTextLine(ctx, (firstItem?.name || '?').charAt(0).toUpperCase(), heroX + heroW / 2, heroY + heroH / 2, {
        font: '700 140px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
        color: '#cbd5e1',
        align: 'center',
        baseline: 'middle'
      })
    }
  }

  const qrTarget = shareUrl || shareCode
  const qrDataUrl = await QRCode.toDataURL(qrTarget, {
    width: 360,
    margin: 3,
    errorCorrectionLevel: 'H',
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  })
  const qrImage = await loadImage(qrDataUrl)

  drawRoundedCard(ctx, 84, 1120, POSTER_WIDTH - 168, 440, 34, 'rgba(255,255,255,0.82)', 'rgba(15, 23, 42, 0.08)')

  const titleText = goodsItems.length > 1 ? `${String(firstItem?.name || '未命名谷子')} 等 ${goodsItems.length} 件` : String(firstItem?.name || '未命名谷子')
  drawMultilineText(ctx, titleText, 126, 1188, 520, 40, {
    maxLines: 2,
    font: '700 38px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
    color: '#0f172a'
  })
  const metaText = goodsItems.length > 1
    ? buildMultiItemMeta(goodsItems)
    : [firstItem?.ip, firstItem?.category, firstItem?.variant, safePriceText(firstItem)].filter(Boolean).join(' · ')
  if (metaText) {
    drawMultilineText(ctx, metaText, 126, 1268, 470, 30, {
      maxLines: 2,
      font: '500 24px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
      color: '#64748b'
    })
  }

  drawTextLine(ctx, '扫码导入到 Goods App', 126, 1332, {
    font: '700 24px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
    color: '#0f172a'
  })

  const qrBoxSize = 286
  const qrBoxX = POSTER_WIDTH - 126 - qrBoxSize
  const qrBoxY = 1230
  drawRoundedCard(ctx, qrBoxX - 18, qrBoxY - 18, qrBoxSize + 36, qrBoxSize + 36, 24, '#ffffff', 'rgba(15, 23, 42, 0.12)')
  ctx.drawImage(qrImage, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize)

  // Center logo on QR code
  if (logoImg) {
    const qrCenterX = qrBoxX + qrBoxSize / 2
    const qrCenterY = qrBoxY + qrBoxSize / 2
    const qrLogoSize = 60
    const qrLogoX = qrCenterX - qrLogoSize / 2
    const qrLogoY = qrCenterY - qrLogoSize / 2

    // White background behind logo
    ctx.save()
    ctx.fillStyle = '#ffffff'
    clipRoundedRect(ctx, qrLogoX - 4, qrLogoY - 4, qrLogoSize + 8, qrLogoSize + 8, 14)
    ctx.fill()
    ctx.restore()

    // Logo image
    ctx.save()
    clipRoundedRect(ctx, qrLogoX, qrLogoY, qrLogoSize, qrLogoSize, 12)
    ctx.clip()
    ctx.drawImage(logoImg, qrLogoX, qrLogoY, qrLogoSize, qrLogoSize)
    ctx.restore()
  }

  drawTextLine(ctx, '分享码', 126, 1442, {
    font: '600 23px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
    color: '#64748b'
  })
  drawMultilineText(ctx, shareCode || '-', 126, 1480, 470, 36, {
    maxLines: 2,
    font: '700 30px "SF Mono", "Cascadia Code", "JetBrains Mono", Consolas, monospace',
    color: '#0f172a'
  })

  return canvas.toDataURL('image/png')
}
