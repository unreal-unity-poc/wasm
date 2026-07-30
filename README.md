# WASM Renderer

This target renders the Rust-owned simulation state through WebAssembly running in a Web Worker.

Hot-path frame data flows as:

```text
UI input -> Worker -> Rust Engine in WASM -> packed frame -> main-thread Canvas
```

The Worker owns the Rust/WASM engine. The UI thread renders only.

Two transport modes are supported:

- Transferable `ArrayBuffer`: the Worker writes a packed frame and transfers ownership with `postMessage(buffer, [buffer])`. This is the default because it works from a basic local server.
- `SharedArrayBuffer`: when `crossOriginIsolated` is available, the Worker creates a shared frame buffer and the UI reads the latest version with `Atomics`.

The packed frame contains Rust's `EarthRenderState` followed by flattened `SurfacePatch` values. It avoids JSON on the frame path.

Run shape:

```bash
wasm-pack build --target web
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

For `SharedArrayBuffer`, serve with COOP/COEP headers so the page is cross-origin isolated.

Expected output:

- Blue earth globe.
- Green Rust-owned surface patches.
- Worker-owned Rust/WASM simulation with UI-only rendering.
