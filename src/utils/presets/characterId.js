// 角色身份：把「角色名」升级为 (ip, name) 复合身份。
//
// 行表主键是 (user_id, domain, id)。角色若只用名字当 id，不同 IP 下的同名角色
// 会互相覆盖（后写赢，`addCharacter` 也会被同名挡住）。复合 id 用 `ip::name`
// （无 IP 时 `::name`），与收藏馆的 `ip::角色名` 约定一致。
//
// 放在纯 util 里是为了让 sync 服务也能共用同一份 id 规则，避免与 presets store
// 形成循环依赖。

export function normalizeCharacterName(name) {
  const text = String(name || '')
    .replace(/^\s*[\/／]+\s*/g, '')
    .replace(/\s*[\/／]+\s*$/g, '')
    .trim()
  if (!text) return ''

  if (/[\u4e00-\u9fff]/.test(text)) {
    return text.replace(/\s*[A-E]$/i, '').trim()
  }

  return text
}

export function buildCharacterRowId(ip, name) {
  const normalizedName = normalizeCharacterName(name)
  if (!normalizedName) return ''
  return `${String(ip || '').trim()}::${normalizedName}`
}

export function parseCharacterRowId(id) {
  const text = String(id || '')
  const sep = text.indexOf('::')
  if (sep < 0) return { ip: '', name: normalizeCharacterName(text) }
  return { ip: text.slice(0, sep).trim(), name: normalizeCharacterName(text.slice(sep + 2)) }
}
