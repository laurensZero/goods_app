/**
 * 共享测试 mock 工厂
 */

// Mock i18n: t() 返回 key 本身，方便断言翻译键
export function createMockI18n() {
  return {
    global: {
      locale: { value: 'zh-CN' },
      t: (key, params) => params ? `${key}:${JSON.stringify(params)}` : key
    }
  }
}

// 内存存储 mock，替代 Capacitor platform/storage
export function createInMemoryStorage() {
  const store = new Map()
  return {
    readPersisted: async (key, fallback = null) => store.get(key) ?? fallback,
    writePersisted: async (key, value) => { store.set(key, value) },
    removePersisted: async (key) => { store.delete(key) },
    _store: store
  }
}
