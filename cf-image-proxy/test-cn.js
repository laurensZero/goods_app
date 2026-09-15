// 测试 Supabase 从用户真实网络的访问速度
const SUPABASE_URL = 'https://zvqzicimowfqshgjsrri.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2cXppY2ltb3dmcXNoZ2pzcnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MjE3NzEsImV4cCI6MjA5Mzk5Nzc3MX0.AZQhPIv79WKtF1bhreMhM89CvOJ8p-1wizNiRgmnRzI'

async function test(label, url, headers = {}) {
  const times = []
  for (let i = 0; i < 6; i++) {
    const t0 = performance.now()
    try {
      const r = await fetch(url, { headers, cache: 'no-store' })
      await r.arrayBuffer()
      const t1 = performance.now()
      if (i >= 1) times.push(t1 - t0) // skip first
    } catch (e) {
      if (i >= 1) times.push(-1)
    }
  }
  const valid = times.filter(t => t > 0)
  if (valid.length === 0) { console.log(`  ${label}: 全部失败`); return null }
  const avg = valid.reduce((a,b)=>a+b,0) / valid.length
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  console.log(`  ${label}: 平均 ${avg.toFixed(0)}ms | ${min.toFixed(0)}~${max.toFixed(0)}ms (${valid.length}次)`)
  return avg
}

async function main() {
  console.log('=== Supabase 访问速度测试 ===\n')

  // 1. Supabase API
  console.log('1. Supabase API:')
  await test('Auth health', `${SUPABASE_URL}/auth/v1/health`, { apikey: ANON_KEY })

  // 2. Storage (TTFB)
  console.log('\n2. Supabase Storage:')
  await test('Storage public', `${SUPABASE_URL}/storage/v1/object/public/goods-images/.emptyFolderPlaceholder`)

  // 3. DB REST API
  console.log('\n3. Supabase DB REST:')
  await test('REST query', `${SUPABASE_URL}/rest/v1/goods?select=id&limit=1`, {
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`
  })

  console.log('\n=== 结论 ===')
  console.log('如果平均 < 300ms: 国内直连可用，不需要加速')
  console.log('如果平均 300-1000ms: 偏慢，值得优化')
  console.log('如果平均 > 1000ms 或经常失败: 需要加速方案')
}

main()
