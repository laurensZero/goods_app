import { describe, it, expect } from 'vitest'
import { buildCustomThemeTokens } from '../theme'

describe('buildCustomThemeTokens', () => {
  const lightColors = {
    bg: '#ffffff',
    surface: '#f5f5f7',
    text: '#1d1d1f',
    primary: '#0066cc'
  }

  const darkColors = {
    bg: '#000000',
    surface: '#1c1c1e',
    text: '#f5f5f7',
    primary: '#2997ff'
  }

  it('returns an object with CSS custom properties', () => {
    const tokens = buildCustomThemeTokens(lightColors, 'light')
    expect(tokens['--app-bg']).toBe('#ffffff')
    expect(tokens['--app-surface']).toBe('#f5f5f7')
    expect(tokens['--app-text']).toBe('#1d1d1f')
    expect(tokens['--app-primary']).toBe('#0066cc')
  })

  it('produces different tokens for light and dark', () => {
    const light = buildCustomThemeTokens(lightColors, 'light')
    const dark = buildCustomThemeTokens(darkColors, 'dark')
    expect(light['--app-bg']).not.toBe(dark['--app-bg'])
    expect(light['--app-bg-gradient']).not.toBe(dark['--app-bg-gradient'])
  })

  it('includes gradient and surface variants', () => {
    const tokens = buildCustomThemeTokens(lightColors, 'light')
    expect(tokens['--app-bg-gradient']).toContain('linear-gradient')
    expect(tokens['--app-surface-soft']).toBeTruthy()
    expect(tokens['--app-surface-muted']).toBeTruthy()
  })

  it('includes glass effect tokens', () => {
    const tokens = buildCustomThemeTokens(lightColors, 'light')
    expect(tokens['--app-glass']).toContain('rgba')
    expect(tokens['--app-glass-strong']).toContain('rgba')
    expect(tokens['--app-glass-border']).toContain('rgba')
  })

  it('includes frost blur tokens', () => {
    const tokens = buildCustomThemeTokens(lightColors, 'light')
    expect(tokens['--app-frost-blur']).toContain('px')
    expect(tokens['--app-frost-soft-blur']).toContain('px')
    expect(tokens['--app-overlay-blur']).toContain('px')
  })

  it('includes summary card tokens', () => {
    const tokens = buildCustomThemeTokens(lightColors, 'light')
    expect(tokens['--summary-card-gradient']).toContain('linear-gradient')
    expect(tokens['--summary-card-text']).toBeTruthy()
    expect(tokens['--summary-card-label']).toContain('rgba')
  })

  it('includes text opacity variants', () => {
    const tokens = buildCustomThemeTokens(lightColors, 'light')
    expect(tokens['--app-text-secondary']).toContain('rgba')
    expect(tokens['--app-text-tertiary']).toContain('rgba')
    expect(tokens['--app-placeholder']).toContain('rgba')
  })

  it('includes border and shadow tokens', () => {
    const tokens = buildCustomThemeTokens(lightColors, 'light')
    expect(tokens['--app-border']).toContain('rgba')
    expect(tokens['--app-shadow']).toContain('px')
  })

  it('respects custom blur value', () => {
    const tokens = buildCustomThemeTokens(lightColors, 'light', { blur: 30 })
    expect(tokens['--app-frost-blur']).toBe('30px')
  })

  it('clamps blur to valid range', () => {
    const tokensLow = buildCustomThemeTokens(lightColors, 'light', { blur: -5 })
    expect(tokensLow['--app-frost-blur']).toBe('0px')

    const tokensHigh = buildCustomThemeTokens(lightColors, 'light', { blur: 100 })
    expect(tokensHigh['--app-frost-blur']).toBe('36px')
  })

  it('handles custom colors', () => {
    const customColors = {
      bg: '#123456',
      surface: '#abcdef',
      text: '#654321',
      primary: '#ff0000'
    }
    const tokens = buildCustomThemeTokens(customColors, 'light')
    expect(tokens['--app-bg']).toBe('#123456')
    expect(tokens['--app-primary']).toBe('#ff0000')
  })
})
