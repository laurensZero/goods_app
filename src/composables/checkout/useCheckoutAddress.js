/**
 * 地址选择 composable
 */
import { ref, computed } from 'vue'
import { fetchAddressList } from '@/utils/mihoyo/checkout'

export function useCheckoutAddress() {
  const addresses = ref([])
  const selectedAddressId = ref('')
  const loading = ref(false)
  const error = ref('')

  const selectedAddress = computed(() =>
    addresses.value.find((a) => String(a.id) === String(selectedAddressId.value)) || null
  )

  async function loadAddresses(cookie) {
    loading.value = true
    error.value = ''
    try {
      const list = await fetchAddressList(cookie)
      addresses.value = list
      if (list.length) {
        const defaultAddr = list.find((a) => a.is_default === 1) || list[0]
        selectedAddressId.value = String(defaultAddr.id)
      }
    } catch (e) {
      error.value = e.message || '获取地址失败'
    } finally {
      loading.value = false
    }
  }

  function selectAddress(id) {
    selectedAddressId.value = String(id)
  }

  function formatAddress(addr) {
    if (!addr) return ''
    return `${addr.province_name || ''}${addr.city_name || ''}${addr.county_name || ''}${addr.addr_ext || ''}`
  }

  return {
    addresses,
    selectedAddressId,
    selectedAddress,
    loading,
    error,
    loadAddresses,
    selectAddress,
    formatAddress,
  }
}
