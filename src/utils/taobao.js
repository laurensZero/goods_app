/**
 * 淘宝订单 XLSX 解析工具
 * 解析淘宝"导出订单"功能导出的 .xlsx 文件（Open XML 格式，字符串内联，无 sharedStrings）
 *
 * xlsx 字段映射：
 *   A: 订单号    B: 订单提交时间   C: 订单状态   D: 店铺名称
 *   E: 商品名称  F: 商品链接      G: 型号款式
 *   H: 商品数量  I: 商品金额      J: 实付金额   K: 运费
 *
 * 多件订单：首行有 A-K，后续子行只有 E-K（继承上一行的订单信息）
 */
import { unzipSync, strFromU8 } from 'fflate'
import { parseTitleIpName, parseCategoryFromName, cleanGoodsName } from './mihoyo.js'

// ── XML 解析 ──────────────────────────────────────────────────────────────────

/** 解析 sharedStrings.xml，返回字符串数组 */
function parseSharedStrings(xml) {
  if (!xml) return []
  const result = []
  const re = /<si>[\s\S]*?<\/si>/g
  for (const siBlock of xml.matchAll(re)) {
    // 取 <si> 内所有 <t> 拼接
    const texts = []
    for (const m of siBlock[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) {
      texts.push(m[1])
    }
    result.push(texts.join('').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'))
  }
  return result
}

/** 解析 sheet1.xml，返回稀疏的 row 数组（每个 row 是 { A..K: value } 映射） */
function parseSheet(sheetXml, sharedStrings) {
  const rows = []
  for (const rowMatch of sheetXml.matchAll(/<row\s+r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowIdx = parseInt(rowMatch[1]) - 1   // 0-based
    const cells = {}
    for (const cellMatch of rowMatch[2].matchAll(/<c\s+r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const col   = cellMatch[1]
      const attrs = cellMatch[2]
      const inner = cellMatch[3]
      let val = ''
      const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/)
      if (!vMatch) { cells[col] = ''; continue }
      if (attrs.includes('t="s"') && sharedStrings.length) {
        // shared string index
        val = sharedStrings[parseInt(vMatch[1])] || ''
      } else if (attrs.includes('t="str"') || attrs.includes('t="inlineStr"')) {
        val = vMatch[1]
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      } else {
        // Number or other - might be date serial, use raw
        val = vMatch[1]
      }
      cells[col] = val
    }
    if (Object.keys(cells).length > 0) rows[rowIdx] = cells
  }
  return rows
}

// ── 字段解析辅助 ──────────────────────────────────────────────────────────────

const NON_CHAR_WORDS = [
  '贺图', '贺卡', '周年', '配色', '全套', '套组', '套装', '组合', '合集',
  '随机', '加购', '赠品', '礼盒', '礼品', '礼包', '福袋', '特典',
  '联名', '联动', '合作', '纪念', '限定', '典藏', '豪华', '版本',
  '白色', '黑色', '红色', '蓝色', '绿色', '黄色', '粉色', '紫色', '橙色', '棕色', '灰色',
  '渐变', '单色', '彩色', '全彩',
  '标准', '普通', '完整', '初始', '全部', '其他',
]

// 量词前缀（如"一套"、"一件"、"两件"）
const MEASURE_WORD_RE = /^[一二三四五六七八九十百\d]+[套件个种组盒箱份册张枚块片个]/

/** 判断清洗后的字符串是否像角色名 */
function looksLikeCharName(s) {
  if (!s) return false
  const clean = s.trim()
  if (clean.length < 2 || clean.length > 8) return false
  if (/^[A-Za-z0-9\s]+$/.test(clean)) return false          // 纯英数不是角色名
  if (!/[\u4e00-\u9fff]/.test(clean)) return false            // 必须含汉字
  if (NON_CHAR_WORDS.some(w => clean.includes(w))) return false
  if (MEASURE_WORD_RE.test(clean)) return false               // "一套"、"两件" 等量词短语
  if (clean.includes('-') || clean.includes('码') || clean.includes('尺')) return false  // 尺码
  return true
}

/**
 * 解析 G 列（型号款式）
 * 格式：
 *   多属性：`颜色分类：白色;款式：徽章-珐露珊` （全角/半角冒号，分号分隔）
 *   单属性：`款式：徽章-珐露珊` / `款式:徽章-珐露珊`
 *   旧格式：`系列名;角色名【状态】`
 * 返回 { character, variant }
 */
function parseVariantField(g) {
  if (!g) return { character: null, variant: '' }

  // 辅助：从单个属性值中提取角色名
  // 尝试 "X-角色名"、"X 角色名"、整体是角色名 三种情况
  function extractCharFromValue(val) {
    const v = val.replace(/【[^】]*】/g, '').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim()
    if (!v) return { character: null, variant: '' }
    // 试连字符：分类-角色
    const dashIdx = v.lastIndexOf('-')
    if (dashIdx !== -1) {
      const afterDash = v.slice(dashIdx + 1).trim()
      if (looksLikeCharName(afterDash)) {
        return { character: afterDash, variant: v.slice(0, dashIdx).trim() }
      }
    }
    // 试空格：分类 角色
    const spaceIdx = v.lastIndexOf(' ')
    if (spaceIdx !== -1) {
      const afterSpace = v.slice(spaceIdx + 1).trim()
      if (looksLikeCharName(afterSpace)) {
        return { character: afterSpace, variant: v.slice(0, spaceIdx).trim() }
      }
    }
    // 整体像角色名
    if (looksLikeCharName(v)) return { character: v, variant: '' }
    return { character: null, variant: v }
  }

  // 含冒号（半角 : 或全角 ：）→ 按 ; 分割成多个属性对
  if (/[:：]/.test(g)) {
    // 优先查找含角色信息的属性键
    const CHAR_KEYS = ['角色', '款式', '类型', '规格', '型号']
    // 分割多个属性
    const parts = g.split(';').map(s => s.trim()).filter(Boolean)

    // 先尝试 CHAR_KEYS 中的属性
    for (const key of CHAR_KEYS) {
      const part = parts.find(p => p.startsWith(key + ':') || p.startsWith(key + '：'))
      if (part) {
        const colonPos = part.search(/[:：]/)
        const value = part.slice(colonPos + 1).trim()
        const result = extractCharFromValue(value)
        if (result.character) return result
      }
    }
    // 找不到特定key → 尝试最后一个 kv 对
    const last = parts[parts.length - 1]
    const colonPos = last.search(/[:：]/)
    if (colonPos !== -1) {
      const value = last.slice(colonPos + 1).trim()
      return extractCharFromValue(value)
    }
    // 无冒号的最后一个 part
    return extractCharFromValue(last)
  }

  const semiIdx = g.indexOf(';')
  if (semiIdx === -1) {
    // 没有分号，整体作为 variant
    const stripped = g.replace(/【[^】]*】/g, '').replace(/（[^）]*）/g, '').trim()
    return { character: looksLikeCharName(stripped) ? stripped : null, variant: stripped }
  }

  const part2 = g.slice(semiIdx + 1).trim()
  // 去除状态括号
  const cleanPart2 = part2
    .replace(/【[^】]*】/g, '').replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '').trim()

  if (looksLikeCharName(cleanPart2)) {
    return { character: cleanPart2, variant: '' }
  }
  // 不像角色名（颜色/尺码等），作为款式
  return { character: null, variant: cleanPart2 }
}

// 已知的淘宝 IP 别名 → 标准 IP 名（用于从商品标题提取到的 rawIp 修正）
const IP_ALIAS_MAP = {
  '原神官方':       '原神',
  '崩坏星穹铁道':   '崩坏：星穹铁道',
  '星穹铁道':       '崩坏：星穹铁道',
  '绝区零官方':     '绝区零',
  '米哈游官方':     '米哈游',
  'MiHoYo':        '米哈游',
}

/**
 * 店铺名 → IP 前缀规则（按优先级从高到低）
 * 前缀命中即返回对应 IP；未命中返回 null（继续从商品标题推断）
 */
const STORE_IP_RULES = [
  { prefix: '原神',                ip: '原神' },
  { prefix: '绝区零',              ip: '绝区零' },
  { prefix: '崩坏：星穹铁道',      ip: '崩坏：星穹铁道' },
  { prefix: '崩坏星穹铁道',        ip: '崩坏：星穹铁道' },
  { prefix: '星穹铁道',            ip: '崩坏：星穹铁道' },
  { prefix: '崩坏3',              ip: '崩坏3' },
  { prefix: '崩坏第三章',          ip: '崩坏3' },
  { prefix: '未定事件簿',          ip: '未定事件簿' },
  { prefix: '蔚蓝档案',            ip: '蔚蓝档案' },
  { prefix: '少女前线2',           ip: '少女前线2' },
  { prefix: '明日方舟',            ip: '明日方舟' },
]

/** 从谷子名称中去掉 IP/官方标签括号（可能出现在非行首位置，如 "2023年【原神官方】xxx"） */
function stripIpBrackets(text) {
  if (!text) return text
  return text
    // 去掉括号内容为 IP 名、品牌名或官方标识的【...】
    .replace(/【(?:原神官方?|崩坏[：:]?星穹铁道|绝区零官方?|米哈游官方?|崩坏3|未定事件簿|蔚蓝档案|明日方舟|少女前线\d?|miHoYo|MiHoYo)】/g, '')
    // 合并多余空格
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** 从淘宝店铺名推断 IP，无法确定时返回 null */
function ipFromShopName(shopName) {
  if (!shopName) return null
  for (const { prefix, ip } of STORE_IP_RULES) {
    if (shopName.startsWith(prefix)) return ip
  }
  return null
}

/**
 * 淘宝商品名 IP 修正：
 * 商品名格式常为「米哈游/崩坏：星穹铁道」→ parseTitleIpName 取 '/' 前面部分 = "米哈游"
 * 改成取最后一段作为游戏 IP
 */
function refineTaobaoIp(rawIp, productTitle) {
  // 1. 别名映射
  if (rawIp && IP_ALIAS_MAP[rawIp]) return IP_ALIAS_MAP[rawIp]

  if (!rawIp || (rawIp !== '米哈游' && rawIp !== 'miHoYo')) return rawIp
  const m = productTitle.match(/^[【「\[]\s*([^】」\]]+)\s*[】」\]]/)
  if (!m) return rawIp
  const parts = m[1].split('/').map(s => s.trim()).filter(Boolean)
  const last = parts[parts.length - 1]
  if (last && last !== '米哈游' && last !== 'miHoYo') return last
  return rawIp
}

// ── 主函数 ────────────────────────────────────────────────────────────────────

/**
 * 解析淘宝导出的 XLSX ArrayBuffer，返回谷子列表
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Array} 谷子对象数组
 */
export function parseTaobaoXlsx(arrayBuffer) {
  const uint8 = new Uint8Array(arrayBuffer)

  let files
  try {
    files = unzipSync(uint8)
  } catch (e) {
    throw new Error('文件解压失败，请确认是有效的 .xlsx 文件')
  }

  const sheetEntry = files['xl/worksheets/sheet1.xml']
  if (!sheetEntry) throw new Error('未找到工作表数据，文件格式不支持')

  const sheetXml = strFromU8(sheetEntry)
  const sharedStrings = parseSharedStrings(
    files['xl/sharedStrings.xml'] ? strFromU8(files['xl/sharedStrings.xml']) : ''
  )

  const rows = parseSheet(sheetXml, sharedStrings)

  // 跳过第 0 行（表头）
  const dataRows = rows.slice(1).filter(Boolean)

  const result = []
  let currentOrder = null

  for (const row of dataRows) {
    // 有 A 列 = 新订单首行
    if (row.A && row.A.length > 0) {
      currentOrder = {
        orderNo:   row.A,
        date:      row.B ? String(row.B).slice(0, 10) : '',
        status:    row.C || '',
        shopName:  row.D || '',
      }
    }
    if (!currentOrder) continue

    const productTitle = row.E || ''
    const productUrl   = row.F || ''   // 商品链接（用于抓取淘宝主图）
    const variantField = row.G || ''
    const quantityStr  = row.H || '1'
    const priceStr     = row.I || ''

    if (!productTitle) continue

    // 清洗商品名（去预售标注 + 末尾 " miHoYo"）
    const cleanTitle = cleanGoodsName(productTitle)
      .replace(/\s*miHoYo\s*$/i, '').trim()

    const { ip: rawIp, name: rawName } = parseTitleIpName(cleanTitle)
    // 去除名称中残留的 IP 括号（如 "2023年【原神官方】xxx" 中非行首括号）
    const name = stripIpBrackets(rawName) || stripIpBrackets(cleanTitle)
    // 优先用店铺名推断 IP，失败时再从商品标题提取
    const shopIp = ipFromShopName(currentOrder.shopName)
    const ip = shopIp || refineTaobaoIp(rawIp, cleanTitle)
    const { character, variant } = parseVariantField(variantField)
    const category = parseCategoryFromName(cleanTitle) || parseCategoryFromName(name) || parseCategoryFromName(variant)
    const price = priceStr ? parseFloat(priceStr.replace(/[￥¥,\s]/g, '')) : null
    const quantity = Math.max(1, parseInt(quantityStr) || 1)

    result.push({
      name:       name || cleanTitle,
      ip:         ip || '',
      characters: character ? [character] : [],
      variant:    variant || '',
      price:      price != null ? String(price) : '',
      acquiredAt: currentOrder.date,
      category:   category || '',
      image:      '',
      note:       `淘宝订单 #${currentOrder.orderNo}`,
      quantity,
      // 内部元数据（不入库）
      _itemKey:       `${currentOrder.orderNo}_${cleanTitle}_${variantField}`,
      _orderNo:       currentOrder.orderNo,
      _status:        currentOrder.status,
      _shopName:      currentOrder.shopName,
      _productUrl:    productUrl,
      _displayVariant: variantField,
    })
  }

  return result
}
