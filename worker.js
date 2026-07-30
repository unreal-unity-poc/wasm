import init, { WasmEngine } from "./pkg/rust_wasm_renderer.js";

const wasm = await init();

const engine = new WasmEngine();
let input = { rotateX: 0, rotateY: 0, zoom: 0, reset: 0 };
let mode = "transfer";
let shared = null;
let version = 0;

self.addEventListener("message", (event) => {
  if (event.data.type === "configure") {
    mode = event.data.mode === "shared" && typeof SharedArrayBuffer !== "undefined"
      ? "shared"
      : "transfer";

    if (mode === "shared") {
      shared = new SharedArrayBuffer(frameByteLength());
      self.postMessage({ type: "shared-ready", buffer: shared });
    }
  } else if (event.data.type === "input") {
    input = event.data.input;
  }
});

function frameByteLength() {
  const patchCount = engine.patches_len();
  const floatCount = 9 + patchCount * 5;
  return 16 + floatCount * Float32Array.BYTES_PER_ELEMENT;
}

function writeFrame(buffer, isShared) {
  const header = new Int32Array(buffer, 0, 4);
  const floats = new Float32Array(buffer, 16);
  const patchCount = engine.patches_len();

  header[1] = patchCount;
  header[2] = 9 + patchCount * 5;

  const statePtr = engine.render_state_ptr();
  const state = new Float32Array(wasm.memory.buffer, statePtr, 9);
  floats.set(state, 0);

  const patchesPtr = engine.patches_ptr();
  const patches = new Float32Array(wasm.memory.buffer, patchesPtr, patchCount * 5);
  floats.set(patches, 9);

  if (isShared) {
    Atomics.store(header, 0, ++version);
  } else {
    header[0] = ++version;
  }
}

function tick() {
  engine.set_input(input.rotateX, input.rotateY, input.zoom, input.reset);
  engine.tick(1 / 60);

  if (mode === "shared" && shared) {
    writeFrame(shared, true);
  } else {
    const buffer = new ArrayBuffer(frameByteLength());
    writeFrame(buffer, false);
    self.postMessage({ type: "frame", buffer }, [buffer]);
  }
}

setInterval(tick, 16);
