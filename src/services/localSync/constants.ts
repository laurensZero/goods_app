export const LOCAL_SYNC_PROTOCOL_VERSION = '1.0.0'
export const LOCAL_SYNC_DEFAULT_PORT = 51823
export const LOCAL_SYNC_API_PREFIX = '/api/local-sync'

export const LOCAL_SYNC_TIMEOUT = {
  discoverMs: 1800,
  requestMs: 8000,
  chunkMs: 12000,
  overallMs: 90000
}

export const LOCAL_SYNC_CHUNK_SIZE = 256 * 1024

export const LOCAL_SYNC_ERROR_HINT = {
  timeout: '连接超时。请确认两台设备在同一局域网，并检查防火墙是否放行本地同步端口。',
  network: '无法连接到目标设备。可能是 AP 隔离已开启，或目标设备未运行本地同步服务。',
  forbidden: '目标设备拒绝连接。请检查服务端是否允许当前网络访问。'
}
