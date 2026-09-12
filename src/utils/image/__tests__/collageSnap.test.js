import { describe, expect, it } from 'vitest'
import {
  COLLAGE_SNAP_THRESHOLD,
  buildCanvasAxisTargets,
  computeAlignDelta,
  findSnapOnAxis
} from '../collageSnap'

describe('collageSnap', () => {
  it('snaps exact edge with zero delta', () => {
    const result = findSnapOnAxis([12, 50], [0, 50, 100], COLLAGE_SNAP_THRESHOLD)
    expect(result).toEqual({ delta: 0, target: 50 })
  })

  it('snaps near edge within threshold', () => {
    const result = findSnapOnAxis([7], [0], COLLAGE_SNAP_THRESHOLD)
    expect(result).toEqual({ delta: -7, target: 0 })
  })

  it('prefers closer target', () => {
    const result = findSnapOnAxis([48], [0, 50], 8)
    expect(result?.target).toBe(50)
    expect(result?.delta).toBeCloseTo(2)
  })

  it('returns null when outside threshold', () => {
    expect(findSnapOnAxis([20], [0], 8)).toBeNull()
  })

  it('builds canvas center targets', () => {
    expect(buildCanvasAxisTargets(200, true)).toEqual([0, 100, 200])
  })

  it('computes center align delta', () => {
    // object center at 10+20=30, canvas center at 50 → dx=20
    const delta = computeAlignDelta({ left: 10, top: 10, width: 40, height: 40 }, 100, 100, 'center')
    expect(delta.dx).toBeCloseTo(20)
    expect(delta.dy).toBeCloseTo(20)
  })
})
