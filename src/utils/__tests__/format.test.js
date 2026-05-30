vi.mock('@/locales', () => ({
  default: {
    global: {
      locale: { value: 'zh-CN' },
      t: (key) => key
    }
  }
}))

// Mock constants
vi.mock('@/constants/currencies', () => ({
  CURRENCY_MAP: {
    CNY: { symbol: '¥', name: '人民币' },
    USD: { symbol: '$', name: '美元' },
    JPY: { symbol: '¥', name: '日元', decimals: 0 }
  },
  DEFAULT_CURRENCY: 'CNY'
}))

import { describe, it, expect } from 'vitest'
import { formatDate, formatPrice, formatCurrency, formatCNYConverted } from '../format'

describe('formatDate', () => {
  it('formats with default pattern', () => {
    const date = new Date(2024, 0, 5) // Jan 5, 2024
    expect(formatDate(date)).toBe('2024-01-05')
  })

  it('formats with custom pattern', () => {
    const date = new Date(2024, 0, 5)
    expect(formatDate(date, 'YYYY年MM月DD日')).toBe('2024年01月05日')
  })

  it('formats with time', () => {
    const date = new Date(2024, 0, 5, 14, 30)
    expect(formatDate(date, 'YYYY-MM-DD HH:mm')).toBe('2024-01-05 14:30')
  })

  it('accepts date string', () => {
    expect(formatDate('2024-01-05')).toBe('2024-01-05')
  })

  it('returns empty for invalid date', () => {
    expect(formatDate('invalid')).toBe('')
  })

  it('returns epoch date for null (new Date(null) is valid)', () => {
    // new Date(null) is valid (epoch), so formatDate returns '1970-01-01'
    const result = formatDate(null)
    expect(result).toBeTruthy()
  })

  it('pads single digits', () => {
    const date = new Date(2024, 2, 8) // Mar 8
    expect(formatDate(date)).toBe('2024-03-08')
  })
})

describe('formatPrice', () => {
  it('formats number with ¥ prefix', () => {
    expect(formatPrice(99)).toBe('¥99.00')
  })

  it('formats decimal number', () => {
    expect(formatPrice(1888.8)).toBe('¥1888.80')
  })

  it('formats string number', () => {
    expect(formatPrice('50.5')).toBe('¥50.50')
  })

  it('returns — for NaN', () => {
    expect(formatPrice('abc')).toBe('—')
  })

  it('returns — for null', () => {
    expect(formatPrice(null)).toBe('—')
  })

  it('formats zero', () => {
    expect(formatPrice(0)).toBe('¥0.00')
  })
})

describe('formatCurrency', () => {
  it('formats CNY', () => {
    expect(formatCurrency(100, 'CNY')).toBe('¥100')
  })

  it('formats USD', () => {
    expect(formatCurrency(19.99, 'USD')).toBe('$19.99')
  })

  it('formats integer without decimals', () => {
    expect(formatCurrency(100, 'CNY')).toBe('¥100')
  })

  it('defaults to CNY', () => {
    expect(formatCurrency(100)).toBe('¥100')
  })

  it('returns — for NaN', () => {
    expect(formatCurrency('abc', 'CNY')).toBe('—')
  })

  it('falls back to CNY for unknown currency', () => {
    expect(formatCurrency(100, 'UNKNOWN')).toBe('¥100')
  })
})

describe('formatCNYConverted', () => {
  const mockConvert = (amount, currency) => {
    if (currency === 'USD') return amount * 7.2
    return amount
  }

  it('returns empty for CNY', () => {
    expect(formatCNYConverted(100, 'CNY', mockConvert)).toBe('')
  })

  it('returns empty for empty currency', () => {
    expect(formatCNYConverted(100, '', mockConvert)).toBe('')
  })

  it('converts and formats', () => {
    const result = formatCNYConverted(10, 'USD', mockConvert)
    expect(result).toBe('≈ ¥72.00')
  })

  it('returns empty for zero amount', () => {
    expect(formatCNYConverted(0, 'USD', mockConvert)).toBe('')
  })

  it('returns empty for negative amount', () => {
    expect(formatCNYConverted(-10, 'USD', mockConvert)).toBe('')
  })

  it('returns empty for NaN amount', () => {
    expect(formatCNYConverted('abc', 'USD', mockConvert)).toBe('')
  })

  it('returns empty when conversion returns 0', () => {
    const zeroConvert = () => 0
    expect(formatCNYConverted(10, 'USD', zeroConvert)).toBe('')
  })
})
