import { describe, expect, it, vi } from 'vitest'

const fetchAddressList = vi.hoisted(() => vi.fn())

vi.mock('@/utils/mihoyo/checkout', () => ({
  fetchAddressList,
}))

import { useCheckoutAddress } from '../useCheckoutAddress'

describe('useCheckoutAddress', () => {
  it('地址请求失败时继续抛错，阻止下单流程推进', async () => {
    const error = new Error('登录已过期')
    fetchAddressList.mockRejectedValueOnce(error)
    const address = useCheckoutAddress()

    await expect(address.loadAddresses('expired-cookie')).rejects.toBe(error)
    expect(address.error.value).toBe('登录已过期')
    expect(address.loading.value).toBe(false)
  })
})