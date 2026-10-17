// @ts-check
/**
 * 识别后端注册表。
 *
 * 现在只有一条通路：用户自己的视觉模型（`vision`）。
 * 预留扩展位（都只需往 RECOGNITION_BACKENDS 里加一项，UI 与预填逻辑不用改）：
 * - `mlkit`：`@capacitor-mlkit/barcode-scanning` 端侧扫码打词表，完全离线、零成本；
 * - `cloud`：云控的云端识别，服务端持密钥与算力，客户端不存 Key。
 * 切换策略必须是**用户显式选择**，不允许自动降级——静默换后端意味着静默花钱。
 */

import { visionBackend } from './vision'

/** 已注册后端，按优先级排列 */
export const RECOGNITION_BACKENDS = [visionBackend]

/**
 * 当前可用的后端（已配置、能立刻跑）。
 * @returns {import('./types').RecognitionBackend[]}
 */
export function listRecognitionBackends() {
  return RECOGNITION_BACKENDS.filter((backend) => backend.available())
}

/**
 * 取后端：给了 id 就必须命中它（不存在/不可用返回 null，由调用方报错），
 * 没给 id 则取第一个可用后端。
 * @param {string} [id]
 * @returns {import('./types').RecognitionBackend | null}
 */
export function resolveRecognitionBackend(id) {
  if (id) return RECOGNITION_BACKENDS.find((backend) => backend.id === id) || null
  return RECOGNITION_BACKENDS.find((backend) => backend.available()) || null
}

/** 是否至少有一个可用后端（UI 据此决定「拍照识别」入口是可用还是引导去配置） */
export function hasRecognitionBackend() {
  return listRecognitionBackends().length > 0
}
