/**
 * 分类识别评测：规则 vs 相似商品（kNN）留一法。
 *
 * 用法：
 *   npx vite-node scripts/eval-category-neighbors.mjs path/to/goods.json
 *
 * 输入：JSON 数组，或 { goods: [...] }；每条至少包含 { name, category }。
 * 输出：规则命中率、规则 top-1、kNN 覆盖率、kNN top-1、规则漏掉但 kNN 补上的比例。
 *
 * 注意：索引只构建一次，查询时排除当前商品（excludeKeys），
 * IDF 仍包含被排除项，属于轻微乐观偏差，用于横向比较足够。
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createCategoryNeighborIndex } from '../src/utils/tagging/categoryNeighbors.js'
import { CATEGORY_KEYWORDS } from '../src/constants/categoryDefinitions.js'

const IGNORED_CATEGORIES = new Set(['', '其他'])

function parseCategoryByRules(item) {
  // 与 resolveCategory 一致：款式/SKU 文本优先于商品名（系列名往往不含品类词）
  const texts = [item?.variant, item?.name].map((value) => String(value || ''))
  for (const text of texts) {
    if (!text) continue
    const matched = CATEGORY_KEYWORDS.find(({ keywords }) => keywords.some((keyword) => text.includes(keyword)))
    if (matched) return matched.category
  }
  return ''
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`
}

async function main() {
  const inputPath = process.argv[2]
  if (!inputPath) {
    console.error('用法: npx vite-node scripts/eval-category-neighbors.mjs <goods.json>')
    process.exitCode = 1
    return
  }

  const raw = JSON.parse(await readFile(resolve(inputPath), 'utf8'))
  const goods = (Array.isArray(raw) ? raw : raw?.goods || [])
    .filter((item) => item?.name && !IGNORED_CATEGORIES.has(String(item?.category || '').trim()))
    .map((item, index) => ({
      ...item,
      id: item.id != null ? String(item.id) : `__eval_${index}`,
      category: String(item.category).trim(),
      name: String(item.name).trim(),
    }))

  if (goods.length === 0) {
    console.error('没有可评测的数据（需要 name + 非空/非「其他」的 category）')
    process.exitCode = 1
    return
  }

  const index = createCategoryNeighborIndex(goods)
  let ruleHit = 0
  let ruleCorrect = 0
  let knnCovered = 0
  let knnCorrect = 0
  let rescued = 0
  let ruleMissTotal = 0

  for (const item of goods) {
    const ruleCategory = parseCategoryByRules(item)
    if (ruleCategory) {
      ruleHit += 1
      if (ruleCategory === item.category) ruleCorrect += 1
    } else {
      ruleMissTotal += 1
    }

    // 索引文档只用商品名构建，查询也用商品名；SKU 里的品类词由规则层负责
    const neighbor = index.query(item.name, { excludeKeys: [`id:${item.id}`] })
    if (neighbor) {
      knnCovered += 1
      if (neighbor.category === item.category) knnCorrect += 1
      if (!ruleCategory) {
        if (neighbor.category === item.category) rescued += 1
      }
    }
  }

  console.log(`\n样本数: ${goods.length}`)
  console.log(`规则命中: ${ruleHit} (${percent(ruleHit / goods.length)})，其中正确 ${ruleCorrect} (${percent(ruleCorrect / Math.max(ruleHit, 1))})`)
  console.log(`kNN 覆盖: ${knnCovered} (${percent(knnCovered / goods.length)})，覆盖内正确 ${knnCorrect} (${percent(knnCorrect / Math.max(knnCovered, 1))})`)
  console.log(`规则没命中: ${ruleMissTotal}，其中 kNN 救回 ${rescued} (${percent(rescued / Math.max(ruleMissTotal, 1))})`)
  console.log('')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
