export const CURRENCIES = [
  { code: 'CNY', symbol: '¥', name: '人民币', nameKey: 'currency.cny' },
  { code: 'USD', symbol: '$', name: '美元', nameKey: 'currency.usd' },
  { code: 'JPY', symbol: '¥', name: '日元', nameKey: 'currency.jpy' },
  { code: 'EUR', symbol: '€', name: '欧元', nameKey: 'currency.eur' },
  { code: 'GBP', symbol: '£', name: '英镑', nameKey: 'currency.gbp' },
  { code: 'HKD', symbol: 'HK$', name: '港币', nameKey: 'currency.hkd' },
  { code: 'TWD', symbol: 'NT$', name: '新台币', nameKey: 'currency.twd' },
  { code: 'KRW', symbol: '₩', name: '韩元', nameKey: 'currency.krw' }
]

export const DEFAULT_CURRENCY = 'CNY'

export const CURRENCY_MAP = Object.fromEntries(
  CURRENCIES.map((c) => [c.code, c])
)
