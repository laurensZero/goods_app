import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCloudImageUri } from '@/utils/goods/images'
import {
  cloudFileNameFromRef,
  isSyncableRef,
  migrateImageEntry,
  migrateImageList,
  parseRef,
  refFromUri,
  toRef
} from '@/utils/image/ref'
import {
  REF_FIXTURE_ENTRIES,
  SQL_FIXTURE_MARKERS,
  buildSqlFixtureBlock
} from '@/utils/image/__fixtures__/imageRefFixtures'

const SQL_REL = 'supabase/supabase-migration-image-refs.sql'
const SQL_PATH = join(process.cwd(), SQL_REL)

// 迁移脚本按仓库惯例只留本地、不入库（.gitignore 的 supabase-migration-*.sql），
// 克隆 / CI 里可能根本没有这个文件：此时跳过 SQL 侧校验，只保留 fixture 侧的规则校验。
const hasMigrationSql = existsSync(SQL_PATH)

function readSql() {
  return readFileSync(SQL_PATH, 'utf8').replace(/\r\n/g, '\n')
}

describe('image ref 归约规则（与云端迁移共用 fixture）', () => {
  for (const fixture of REF_FIXTURE_ENTRIES) {
    it(`toRef: ${fixture.name}`, () => {
      expect(toRef(fixture.entry)).toBe(fixture.expected)
      // 同一用例应当能直接解析回来（cloud/remote/local 三类）
      const parsed = parseRef(fixture.expected)
      if (fixture.expected) {
        expect(parsed).not.toBeNull()
      } else {
        expect(parsed).toBeNull()
      }
    })
  }

})

describe.skipIf(!hasMigrationSql)('云端迁移 SQL（按仓库惯例只留本地、不入库）', () => {
  it('fixture 块已写入云端迁移 SQL（防 JS / SQL 两套实现漂移）', () => {
    const sql = readSql()
    expect(sql).toContain(SQL_FIXTURE_MARKERS.begin)
    expect(sql).toContain(SQL_FIXTURE_MARKERS.end)
    expect(sql).toContain(buildSqlFixtureBlock(REF_FIXTURE_ENTRIES))
  })

  it('云端迁移 SQL 里真的调用了 image_ref 并覆盖 5 张表', () => {
    const sql = readSql()
    expect(sql).toContain('create or replace function pg_temp.image_ref')
    expect(sql).toContain('update goods g')
    expect(sql).toContain('update events')
    expect(sql).toContain('update events ev')
    expect(sql).toContain('update recharge_records')
    expect(sql).toContain('update batch_drafts bd')
    // 事务 + 备份：失败必须整体回滚，且迁移前留档
    expect(sql).toContain('\nbegin;')
    expect(sql).toContain('\ncommit;')
    for (const table of ['goods', 'events', 'recharge_records', 'batch_drafts']) {
      expect(sql).toContain(`create table if not exists public._bak_image_refs_${table} as select * from public.${table};`)
      expect(sql).toContain(`alter table public._bak_image_refs_${table} enable row level security;`)
    }
  })

  it('云端迁移 SQL 可重复执行（重跑不会二次包装 ref）', () => {
    const sql = readSql()
    // 单值字段必须先认已存在的 ref，否则重跑会把 'cloud:a.jpg' 变成 'local:cloud:a.jpg'
    expect(sql).toContain('create or replace function pg_temp.text_ref')
    expect(sql).toContain("coalesce(value, '') ~ '^(remote|local):' then value end")
    expect(sql).toContain('pg_temp.bare_cloud_name(substr(value, 7))')
    // 条目字段重跑时只能从既有的 editSourceRef 取
    expect(sql).toContain("'ref', e ->> 'editSourceRef'")
    // 已经全是新形态的行不参与 UPDATE（避免白 bump updated_at，把所有设备再全量拉一遍）
    expect(sql).toContain("and image !~ '^(cloud|remote|local):'")
    expect(sql).toContain('and exists (')
  })

  it('干跑脚本与正式迁移的规则函数语义一致（防两边各改一半）', () => {
    const dryPath = join(process.cwd(), 'supabase', 'supabase-migration-image-refs-dryrun.sql')
    if (!existsSync(dryPath)) return
    const dryRun = readFileSync(dryPath, 'utf8').replace(/\r\n/g, '\n')
    const migration = readSql()
    // 注释允许不同（干跑版更精简），代码行必须逐字一致
    const body = (text, name) => {
      const start = text.indexOf(`create or replace function pg_temp.${name}(`)
      expect(start, `${name} 未找到`).toBeGreaterThan(-1)
      const end = text.indexOf('$$;', start)
      expect(end, `${name} 未闭合`).toBeGreaterThan(start)
      return text.slice(start, end + 3)
        .split('\n')
        .map((line) => line.replace(/--.*$/, '').trim())
        .filter(Boolean)
        .join('\n')
    }
    for (const name of ['bare_cloud_name', 'image_ref', 'text_ref']) {
      expect(body(dryRun, name), name).toBe(body(migration, name))
    }
  })

  it('云端迁移把 .txt 别名归一化成规范文件名（运行时不做这步）', () => {
    const sql = readSql()
    expect(sql).toContain('create or replace function pg_temp.bare_cloud_name')
    // 四个 cloud 来源都要过一遍归一化
    expect(sql).toContain("pg_temp.bare_cloud_name(entry ->> 'cloudFileName')")
    expect(sql).toContain("pg_temp.bare_cloud_name(substr(entry ->> 'ref', 7))")
    expect(sql).toContain("pg_temp.bare_cloud_name(cloud_file_name)")
    expect(sql).toContain('.txt 别名归一化')
    // 规则只在 SQL 侧：运行时 toRef 保持纯净
    expect(sql).toContain('运行时 toRef 不重复实现')
  })
})

describe('refFromUri / parseRef', () => {
  it('http host 上的电容文件地址按本地处理', () => {
    // convertFileSrc 在不同平台可能给出自定义 host，误判成 remote 会把本地路径推上云
    expect(refFromUri('https://app.example/_capacitor_file_/data/user-images/1_a.jpg'))
      .toBe('local:https://app.example/_capacitor_file_/data/user-images/1_a.jpg')
  })

  it('parseRef 正确拆解三类 ref', () => {
    expect(parseRef('cloud:a.jpg')).toEqual({ kind: 'cloud', value: 'a.jpg' })
    expect(parseRef('remote:https://x/y.png')).toEqual({ kind: 'remote', value: 'https://x/y.png' })
    expect(parseRef('local:data:image/png;base64,AA')).toEqual({ kind: 'local', value: 'data:image/png;base64,AA' })
  })

  it('非 ref 形态与空值返回 null', () => {
    expect(parseRef('https://x/y.png')).toBeNull()
    expect(parseRef('cloud:')).toBeNull()
    expect(parseRef('')).toBeNull()
    expect(parseRef(null)).toBeNull()
  })

  it('只有 cloud / remote 允许进同步载荷', () => {
    expect(isSyncableRef('cloud:a.jpg')).toBe(true)
    expect(isSyncableRef('remote:https://x/y.png')).toBe(true)
    expect(isSyncableRef('local:data:image/png;base64,AA')).toBe(false)
    expect(isSyncableRef('cloud:')).toBe(false)
    expect(cloudFileNameFromRef('cloud:a.jpg')).toBe('a.jpg')
    expect(cloudFileNameFromRef('remote:https://x/y.png')).toBe('')
  })
})

describe('parseCloudImageUri 兼容迁移后的 cloud: 形态', () => {
  it('cloud:<fileName> 能反解出裸文件名', () => {
    // 孤儿回收靠本函数判断"文件是否被引用"：认不出来会把仍在使用的图当孤儿删掉
    expect(parseCloudImageUri('cloud:goods-image__g1__i1__1.jpg')).toBe('goods-image__g1__i1__1.jpg')
  })

  it('既有前缀行为不变', () => {
    expect(parseCloudImageUri('cloud-image://a.jpg')).toBe('a.jpg')
    expect(parseCloudImageUri('gist-image://b.jpg')).toBe('b.jpg')
    expect(parseCloudImageUri('https://x/storage/v1/object/public/goods-images/a.jpg')).toBe('')
    expect(parseCloudImageUri('')).toBe('')
  })
})

describe('migrateImageEntry', () => {
  it('去掉旧字段、补上 ref，其余字段保留', () => {
    const migrated = migrateImageEntry({
      id: 'i1',
      kind: 'primary',
      label: '正面',
      isPrimary: true,
      mimeType: 'image/jpeg',
      fileSize: 1024,
      uri: 'https://api.goodsapp.de5.net/storage/v1/object/public/goods-images/uid/goods-image__g1__i1__1.jpg',
      cloudFileName: 'goods-image__g1__i1__1.jpg',
      storageMode: 'remote',
      localPath: '',
      edit: { frame: 'x' },
      editSourceUri: 'cloud-image://goods-image__g1__i1__1-src.jpg',
      editSourceCloudFileName: 'goods-image__g1__i1__1-src.jpg'
    })

    expect(migrated).toEqual({
      id: 'i1',
      kind: 'primary',
      label: '正面',
      isPrimary: true,
      mimeType: 'image/jpeg',
      fileSize: 1024,
      edit: { frame: 'x' },
      ref: 'cloud:goods-image__g1__i1__1.jpg',
      editSourceRef: 'cloud:goods-image__g1__i1__1-src.jpg'
    })
  })

  it('本机图迁成 local:，不会被当成可同步引用', () => {
    const migrated = migrateImageEntry({ id: 'i2', uri: 'data:image/png;base64,AA', storageMode: 'inline-local' })
    expect(migrated).toEqual({ id: 'i2', ref: 'local:data:image/png;base64,AA' })
    expect(isSyncableRef(migrated.ref)).toBe(false)
  })

  it('幂等：已是 ref 形态的条目原样返回', () => {
    const entry = { id: 'i3', ref: 'cloud:a.jpg', editSourceRef: 'cloud:a-src.jpg' }
    expect(migrateImageEntry(entry)).toEqual(entry)
    expect(migrateImageEntry(migrateImageEntry(entry))).toEqual(entry)
  })

  it('无法引用的条目（无 uri / 无 cloudFileName）不产生 ref 键', () => {
    expect(migrateImageEntry({ id: 'i4', uri: '' })).toEqual({ id: 'i4' })
  })

  it('migrateImageList 跳过非对象项', () => {
    expect(migrateImageList([{ uri: 'cloud-image://a.jpg' }, null, 'junk'])).toEqual([{ ref: 'cloud:a.jpg' }, 'junk'])
  })
})
