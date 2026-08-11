// 管理台通用格式化工具（从 versionRules.js 迁出，职责独立）

export function formatTime(value) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function downloadBlob(content, filename, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// 转 CSV；加 \ufeff BOM 避免 Excel 中文乱码
export function toCsv(rows, headers) {
  const escape = (value) => {
    const text = value === null || value === undefined ? '' : String(value)
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
    return text
  }
  const lines = []
  if (headers) lines.push(headers.map(escape).join(','))
  for (const row of rows) lines.push(row.map(escape).join(','))
  return '\ufeff' + lines.join('\r\n')
}
