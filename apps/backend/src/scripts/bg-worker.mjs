import { readFile, writeFile } from "node:fs/promises"

const [, , inPath, outPath] = process.argv
if (!inPath || !outPath) {
  console.error("usage: bg-worker.mjs <in> <out>")
  process.exit(2)
}

try {
  let removeBackground
  try {
    const mod = await import("@imgly/background-removal-node")
    removeBackground = mod.removeBackground
  } catch (importErr) {
    console.error("bg-worker failed: @imgly/background-removal-node not available:", importErr?.message || importErr)
    process.exit(1)
  }

  const ext = inPath.toLowerCase().split(".").pop()
  const mime =
    ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
    ext === "webp" ? "image/webp" :
    ext === "gif" ? "image/gif" :
    "image/png"

  const src = await readFile(inPath)
  const blob = new Blob([src], { type: mime })
  const result = await removeBackground(blob, { model: "small" })
  const cut = Buffer.from(await result.arrayBuffer())
  await writeFile(outPath, cut)
  process.exit(0)
} catch (e) {
  const msg = e?.message || e
  const isModelError = /model does not support|onnx|model.*fail/i.test(String(msg))
  if (isModelError) {
    console.error("bg-worker failed: ONNX model unavailable or corrupted. Clear the model cache (~/.imgly) and retry, or contact support.")
  } else {
    console.error("bg-worker failed:", msg)
  }
  process.exit(1)
}
