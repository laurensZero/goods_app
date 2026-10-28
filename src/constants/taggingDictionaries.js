/**
 * 静态标签词库的统一出口。
 *
 * categoryRules 不再手写在 JSON 里，而是由 constants/categoryDefinitions.js 生成，
 * 避免「导入关键词表 / 编辑器规则 / 品类词黑名单」三处各写一份、慢慢漂移。
 *
 * 新增固定品类只改 categoryDefinitions.js。
 */
import baseDictionaries from './tagging-dictionaries.json'
import { CATEGORY_RULES } from './categoryDefinitions'

const staticDictionaries = {
  ...baseDictionaries,
  categoryRules: CATEGORY_RULES,
}

export default staticDictionaries
