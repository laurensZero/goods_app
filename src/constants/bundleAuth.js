/**
 * Bundle 认证常量（应用与发布脚本共用）。
 *
 * 认证目标：手动选择 / 安装资源包前校验「官方构建」来源，拒绝篡改包。
 * 算法：HMAC-SHA256（对称密钥）。密钥随包分发，可挡住误装/简单篡改，
 * 无法对抗能改包体的逆向者；如需更强保证应改为原生层 Ed25519 公钥验签。
 */

export const BUNDLE_AUTH_FILE_NAME = 'goods-bundle.auth.json'
export const BUNDLE_AUTH_VERSION = 1
export const BUNDLE_AUTH_ALG = 'HS256'
export const BUNDLE_AUTH_KEY_ID = 'goods-bundle-v1'

/** 与 CI 的 BUNDLE_AUTH_SECRET 保持一致；未配置时用此默认值以便开箱即用。 */
export const BUNDLE_AUTH_SECRET = 'goods-app/bundle-auth/v1/8f3a2c1e-9b7d-4a05-b6e2-1d0c7f4a9e21'

/** 签名消息前缀，防止不同用途签名互换。 */
export const BUNDLE_AUTH_MSG_PREFIX = 'v1'
export const BUNDLE_AUTH_MSG_RELEASE = 'release'
export const BUNDLE_AUTH_MSG_CONTENT = 'content'
