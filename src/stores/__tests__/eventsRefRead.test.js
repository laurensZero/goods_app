// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { normalizeEvent } from '@/stores/events'

// 迁移后 events 行的 cover_image / photos[].ref 是新形态，本地一律翻译回 uri + cloudFileName
describe('normalizeEvent 的 ref 读取', () => {
  it('封面 ref → cloud-image:// + coverImageData.cloudFileName', () => {
    const event = normalizeEvent({
      id: 'evt1',
      name: '展会',
      coverImage: 'cloud:event-cover__evt1__1.jpg'
    })

    expect(event.coverImage).toBe('cloud-image://event-cover__evt1__1.jpg')
    expect(event.coverImageData?.cloudFileName).toBe('event-cover__evt1__1.jpg')
    expect(event.coverImageData?.uri).toBe('cloud-image://event-cover__evt1__1.jpg')
  })

  it('照片 ref → uri + cloudFileName', () => {
    const event = normalizeEvent({
      id: 'evt1',
      name: '展会',
      photos: [{ id: 'p1', ref: 'cloud:event-photo__evt1__p1__1.jpg', caption: '门口' }]
    })

    expect(event.photos).toEqual([
      {
        id: 'p1',
        caption: '门口',
        uri: 'cloud-image://event-photo__evt1__p1__1.jpg',
        cloudFileName: 'event-photo__evt1__p1__1.jpg'
      }
    ])
  })

  it('旧形态（uri + cloudFileName）不受影响', () => {
    const event = normalizeEvent({
      id: 'evt1',
      coverImage: 'cloud-image://event-cover__evt1__1.jpg',
      coverImageData: { cloudFileName: 'event-cover__evt1__1.jpg', storageMode: 'cloud-local' },
      photos: [{ id: 'p1', uri: 'cloud-image://event-photo__evt1__p1__1.jpg' }]
    })

    expect(event.coverImage).toBe('cloud-image://event-cover__evt1__1.jpg')
    expect(event.coverImageData.cloudFileName).toBe('event-cover__evt1__1.jpg')
    expect(event.photos[0].uri).toBe('cloud-image://event-photo__evt1__p1__1.jpg')
  })
})
