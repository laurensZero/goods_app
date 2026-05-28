import { Capacitor, registerPlugin } from '@capacitor/core'

const MihoyoSessionImport = registerPlugin('MihoyoSessionImport')

export function canUseNativeMihoyoImport() {
  return Capacitor.getPlatform() === 'android'
}

export async function importMihoyoOrdersWithSession() {
  return MihoyoSessionImport.importOrders()
}

export async function importMihoyoCartWithSession() {
  return MihoyoSessionImport.importCart()
}

export async function getNativeMihoyoCookie() {
  if (!canUseNativeMihoyoImport()) return ''
  try {
    const result = await MihoyoSessionImport.getSavedCookie()
    return result?.cookie || ''
  } catch {
    return ''
  }
}
