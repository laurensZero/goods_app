// 运行时从 CDN 加载 ONNX Runtime，避免把 ~1.5MB 的 ort JS 打进 APK/静态资源。
// 模型与 wasm 仍由 @imgly/background-removal 按 publicPath 下载；这里只替换其
// `import("onnxruntime-web")` 入口。@vite-ignore 防止 Vite 分析并内联该 URL。
const mod = await import(
  /* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/ort.bundle.min.mjs'
)

export default mod.default
