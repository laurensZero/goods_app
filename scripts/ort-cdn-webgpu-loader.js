// 与 ort-cdn-loader.js 相同策略：WebGPU 入口也走 CDN，避免双份 ORT 进包。
// Android WebView 通常无 navigator.gpu，imgly 会回落到 wasm 路径。
const mod = await import(
  /* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/ort.webgpu.bundle.min.mjs'
)

export default mod.default
