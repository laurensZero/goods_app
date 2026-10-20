import { describe, expect, it } from 'vitest'
import { normalizeBatchDraft } from '@/stores/batchDraftHelpers'

// 迁移后 batch_drafts.items 条目只有 ref，编辑器仍读 imageUri / cloudFileName
describe('normalizeBatchDraft 的 ref 读取', () => {
  it('cloud: ref → imageUri + cloudFileName，且不保留 ref', () => {
    const draft = normalizeBatchDraft({
      slot: 'collection',
      items: [{ id: 'q1', ref: 'cloud:batch-draft-image__collection__q1__1.jpg' }]
    })

    expect(draft.items[0].imageUri).toBe('cloud-image://batch-draft-image__collection__q1__1.jpg')
    expect(draft.items[0].cloudFileName).toBe('batch-draft-image__collection__q1__1.jpg')
    expect(draft.items[0].ref).toBeUndefined()
  })

  it('已有 imageUri 时不被 ref 覆盖（混合期数据）', () => {
    const draft = normalizeBatchDraft({
      slot: 'collection',
      items: [{
        id: 'q1',
        imageUri: 'cloud-image://batch-draft-image__collection__q1__old.jpg',
        cloudFileName: 'batch-draft-image__collection__q1__old.jpg',
        ref: 'cloud:batch-draft-image__collection__q1__1.jpg'
      }]
    })

    expect(draft.items[0].imageUri).toBe('cloud-image://batch-draft-image__collection__q1__old.jpg')
    expect(draft.items[0].cloudFileName).toBe('batch-draft-image__collection__q1__old.jpg')
  })

  it('remote: ref → 外链 URI', () => {
    const draft = normalizeBatchDraft({
      slot: 'collection',
      items: [{ id: 'q1', ref: 'remote:https://example.com/a.jpg' }]
    })

    expect(draft.items[0].imageUri).toBe('https://example.com/a.jpg')
    expect(draft.items[0].cloudFileName).toBe('')
  })

  it('没有 ref 的条目原样保留', () => {
    const item = { id: 'q1', imageUri: 'https://example.com/a.jpg', cloudFileName: '' }
    const draft = normalizeBatchDraft({ slot: 'collection', items: [item] })

    expect(draft.items[0]).toBe(item)
  })
})
