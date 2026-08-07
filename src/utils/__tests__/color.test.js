import { describe, it, expect } from 'vitest'
import { clamp, hexToHsl, hslToHex, isHexColor } from '../color'

describe('color utils', () => {
  it('clamps values into range', () => {
    expect(clamp(150, 0, 100)).toBe(100)
    expect(clamp(-5, 0, 100)).toBe(0)
    expect(clamp(50, 0, 100)).toBe(50)
  })

  it('converts hex to hsl', () => {
    expect(hexToHsl('#ff0000')).toEqual({ h: 0, s: 100, l: 50 })
    expect(hexToHsl('#000000')).toEqual({ h: 0, s: 0, l: 0 })
    expect(hexToHsl('#ffffff')).toEqual({ h: 0, s: 0, l: 100 })
    expect(hexToHsl('#008000')).toEqual({ h: 120, s: 100, l: 25 })
  })

  it('converts hsl to hex', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000')
    expect(hslToHex(0, 0, 0)).toBe('#000000')
    expect(hslToHex(0, 0, 100)).toBe('#ffffff')
    expect(hslToHex(120, 100, 25)).toBe('#008000')
  })

  it('round-trips through hex and hsl', () => {
    const colors = ['#ff8000', '#123456', '#abcdef', '#000000', '#ffffff']
    for (const color of colors) {
      const hsl = hexToHsl(color)
      const reHex = hslToHex(hsl.h, hsl.s, hsl.l)
      expect(reHex).toMatch(/^#[0-9a-f]{6}$/)

      const original = hexToHsl(color)
      const rounded = hexToHsl(reHex)
      expect(Math.abs(rounded.h - original.h)).toBeLessThanOrEqual(1)
      expect(Math.abs(rounded.s - original.s)).toBeLessThanOrEqual(1)
      expect(Math.abs(rounded.l - original.l)).toBeLessThanOrEqual(1)
    }
  })

  it('validates hex color strings', () => {
    expect(isHexColor('#ffffff')).toBe(true)
    expect(isHexColor('#FFF')).toBe(true)
    expect(isHexColor('#123456')).toBe(true)
    expect(isHexColor('ffffff')).toBe(false)
    expect(isHexColor('#12')).toBe(false)
    expect(isHexColor(null)).toBe(false)
  })
})