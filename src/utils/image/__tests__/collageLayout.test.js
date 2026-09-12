import { describe, expect, it } from 'vitest'
import {
  COLLAGE_MAX_IMAGES,
  clampCollageImageCount,
  fitBoxInto,
  resolveCollageRatio,
  resolveExportPixelSize,
  scaleToFitObject
} from '../collageLayout'

describe('collageLayout', () => {
  it('resolves known ratio presets', () => {
    expect(resolveCollageRatio('1:1')).toBe(1)
    expect(resolveCollageRatio('16:9')).toBeCloseTo(16 / 9)
    expect(resolveCollageRatio('free')).toBeNull()
    expect(resolveCollageRatio('missing')).toBeNull()
  })

  it('fits box into container with aspect ratio', () => {
    const square = fitBoxInto(400, 300, 1)
    expect(square.width).toBe(300)
    expect(square.height).toBe(300)

    const wide = fitBoxInto(300, 200, 16 / 9)
    expect(wide.width).toBe(300)
    expect(wide.height).toBeLessThanOrEqual(200)

    const free = fitBoxInto(320, 180, undefined)
    expect(free).toEqual({ width: 320, height: 180 })
  })

  it('clamps image count to max', () => {
    expect(clampCollageImageCount(0, 3)).toBe(3)
    expect(clampCollageImageCount(COLLAGE_MAX_IMAGES - 2, 5)).toBe(2)
    expect(clampCollageImageCount(COLLAGE_MAX_IMAGES, 1)).toBe(0)
  })

  it('scales object to fit canvas', () => {
    expect(scaleToFitObject(2000, 1000, 400, 400)).toBeCloseTo(400 * 0.72 / 2000)
    // 同宽高比：不同像素数进画布后展示尺寸应一致
    const small = scaleToFitObject(100, 100, 400, 400)
    const large = scaleToFitObject(1000, 1000, 400, 400)
    expect(small * 100).toBeCloseTo(large * 1000)
    expect(small).toBeCloseTo(400 * 0.72 / 100)
  })

  it('keeps export aspect ratio matching preview', () => {
    const square = resolveExportPixelSize(360, 360, 2048)
    expect(square.width).toBe(2048)
    expect(square.height).toBe(2048)

    const portrait = resolveExportPixelSize(300, 400, 2048)
    expect(portrait.height).toBe(2048)
    expect(portrait.width).toBe(1536)

    const wide = resolveExportPixelSize(400, 225, 1080)
    expect(wide.width).toBe(1080)
    expect(wide.height).toBe(608)
  })
})
