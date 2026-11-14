import { describe, it, expect } from 'vitest'
import {
  normalizeCharacterBindings,
  buildCharacterCascadeMap,
  expandCharacterNames,
  resolveCharacterPrimaryName,
  remapCharacterBindingName,
  removeCharacterBindingName,
  upsertCharacterBinding,
  rankCharacterBindCandidates
} from '../characterBindings'

describe('normalizeCharacterBindings', () => {
  it('丢弃 id 缺失与少于 2 个名字的组，names 去重规范化', () => {
    expect(normalizeCharacterBindings([
      { id: 'g1', names: ['初音未来', '初音ミク', '初音未来'] },
      { id: '', names: ['a', 'b'] },
      { id: 'g2', names: ['only'] },
      { id: 'g3', names: [] },
      'garbage'
    ])).toEqual([{ id: 'g1', names: ['初音未来', '初音ミク'] }])
  })

  it('非数组输入返回空列表', () => {
    expect(normalizeCharacterBindings(null)).toEqual([])
    expect(normalizeCharacterBindings('x')).toEqual([])
  })
})

describe('buildCharacterCascadeMap / expandCharacterNames', () => {
  const bindings = [
    { id: 'g1', names: ['初音未来', '初音ミク'] },
    { id: 'g2', names: ['芙宁娜', 'Furina'] }
  ]

  it('cascade map 含自身与全部组员', () => {
    const map = buildCharacterCascadeMap(bindings)
    expect([...map.get('初音未来')].sort()).toEqual(['初音ミク', '初音未来'].sort())
    expect(map.has('未绑定')).toBe(false)
  })

  it('expand 保持选中顺序并展开组员', () => {
    expect(expandCharacterNames(['初音未来'], bindings)).toEqual(['初音未来', '初音ミク'])
    expect(expandCharacterNames(['初音ミク', '未绑定'], bindings)).toEqual(['初音ミク', '初音未来', '未绑定'])
    expect(expandCharacterNames([], bindings)).toEqual([])
  })

  it('两个名字同属一组时去重不重复展开', () => {
    expect(expandCharacterNames(['初音未来', '初音ミク'], bindings)).toEqual(['初音未来', '初音ミク'])
  })
})

describe('resolveCharacterPrimaryName', () => {
  const bindings = [{ id: 'g1', names: ['初音未来', '初音ミク'] }]

  it('组内名字解析到第一个名字，未绑定原样返回', () => {
    expect(resolveCharacterPrimaryName('初音ミク', bindings)).toBe('初音未来')
    expect(resolveCharacterPrimaryName('独立角色', bindings)).toBe('独立角色')
    expect(resolveCharacterPrimaryName('', bindings)).toBe('')
  })
})

describe('remapCharacterBindingName', () => {
  it('组内改名成功且保持顺序', () => {
    const next = remapCharacterBindingName([{ id: 'g1', names: ['旧名', 'B'] }], '旧名', '新名')
    expect(next).toEqual([{ id: 'g1', names: ['新名', 'B'] }])
  })

  it('to 已在组内时只删 from，剩 1 个名字的组丢弃', () => {
    const next = remapCharacterBindingName([{ id: 'g1', names: ['旧名', 'B'] }], '旧名', 'B')
    expect(next).toEqual([])
  })

  it('改完只剩一个名字的组丢弃', () => {
    const next = remapCharacterBindingName([{ id: 'g1', names: ['旧名', 'B'] }, { id: 'g2', names: ['C', 'D'] }], '旧名', 'B')
    expect(next).toEqual([{ id: 'g2', names: ['C', 'D'] }])
  })

  it('无关联改动返回 null', () => {
    expect(remapCharacterBindingName([{ id: 'g1', names: ['A', 'B'] }], 'X', 'Y')).toBeNull()
    expect(remapCharacterBindingName([{ id: 'g1', names: ['A', 'B'] }], 'A', 'A')).toBeNull()
  })
})

describe('removeCharacterBindingName', () => {
  it('剔除名字，少于 2 个的组丢弃；无关联返回 null', () => {
    const bindings = [{ id: 'g1', names: ['A', 'B'] }, { id: 'g2', names: ['B', 'C', 'D'] }]
    expect(removeCharacterBindingName(bindings, 'A')).toEqual([{ id: 'g2', names: ['B', 'C', 'D'] }])
    expect(removeCharacterBindingName(bindings, 'B')).toEqual([{ id: 'g2', names: ['C', 'D'] }])
    expect(removeCharacterBindingName(bindings, 'Z')).toBeNull()
  })
})

describe('upsertCharacterBinding', () => {
  it('新建组：成员从其它组改投新组，孤寡旧组丢弃', () => {
    const next = upsertCharacterBinding(
      [{ id: 'g1', names: ['A', 'B'] }, { id: 'g2', names: ['B', 'C'] }],
      ['A', 'C']
    )
    // g1：A 被移走只剩 B → 丢弃；g2：B 留下 + C 移走 → 只剩 B → 丢弃
    expect(next.length).toBe(1)
    expect(next[0].names.sort()).toEqual(['A', 'C'].sort())
    expect(next[0].id).not.toBe('')
  })

  it('更新已有组：复用组 id，名单即全部成员', () => {
    const next = upsertCharacterBinding(
      [{ id: 'g1', names: ['A', 'B'] }],
      ['A', 'C'],
      'g1'
    )
    expect(next).toEqual([{ id: 'g1', names: ['A', 'C'] }])
  })

  it('少于 2 个名字返回 null', () => {
    expect(upsertCharacterBinding([{ id: 'g1', names: ['A', 'B'] }], ['A'])).toBeNull()
    expect(upsertCharacterBinding([], [])).toBeNull()
  })
})

describe('rankCharacterBindCandidates 推荐排序', () => {
  it('公共子串命中的排前面（LV 后缀清理场景）', () => {
    const ranked = rankCharacterBindCandidates('银狼LV.999', ['三月七', '银狼', '托帕&账账'])
    expect(ranked[0].name).toBe('银狼')
    expect(ranked[0].recommended).toBe(true)
    expect(ranked.slice(1).every((item) => !item.recommended)).toBe(true)
  })

  it('商品同现只参与排序、不触发推荐高亮', () => {
    const ranked = rankCharacterBindCandidates('初音未来', ['miku', '洛天依'], {
      coOccurCounts: new Map([['miku', 3]])
    })
    // miku 排前面（同现加分）但不高亮——多角色周边的同现太常见，容易误推荐
    expect(ranked[0].name).toBe('miku')
    expect(ranked[0].recommended).toBe(false)
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score)
    expect(ranked.every((item) => !item.recommended)).toBe(true)
  })

  it('同 IP 加分但不单独构成推荐', () => {
    const ipByName = new Map([['同行者', '崩坏：星穹铁道'], ['开拓者', '崩坏：星穹铁道']])
    const ranked = rankCharacterBindCandidates('开拓者', ['同行者'], { ipByName })
    expect(ranked[0].recommended).toBe(false)
    // 公共子串「者」1 字 ×8 + 同 IP 2
    expect(ranked[0].score).toBe(10)
    expect(ranked[0].score).toBeGreaterThan(rankCharacterBindCandidates('开拓者', ['无关名'], { ipByName })[0].score)
  })

  it('纯拉丁名公共子串门槛 3 字符', () => {
    const ranked = rankCharacterBindCandidates('furina', ['furi', 'furina de fontaine'])
    // "furi" 公共子串 4 ≥ 3 → 推荐；另一个公共子串 "furina" 6 → 更高分
    expect(ranked[0].name).toBe('furina de fontaine')
    expect(ranked.every((item) => item.recommended)).toBe(true)
  })

  it('无信号时保持字母序、全部不推荐', () => {
    const ranked = rankCharacterBindCandidates('某角色', ['乙', '甲'])
    // zh locale 按拼音序：甲(jiǎ) 在 乙(yǐ) 前
    expect(ranked.map((item) => item.name)).toEqual(['甲', '乙'])
    expect(ranked.every((item) => !item.recommended)).toBe(true)
  })
})

describe('rankCharacterBindCandidates 字符重排推荐', () => {
  it('花火 ↔ 火花：字符重排算推荐且排名靠前', () => {
    const ranked = rankCharacterBindCandidates('花火', ['火花', '花兰'])
    expect(ranked[0].name).toBe('火花')
    expect(ranked[0].recommended).toBe(true)
    expect(ranked[1].recommended).toBe(false)
  })

  it('重排长名同样推荐，分值按较短名长度计', () => {
    const ranked = rankCharacterBindCandidates('知更鸟·晴歌', ['晴歌·知更鸟'])
    expect(ranked[0].recommended).toBe(true)
  })
})
