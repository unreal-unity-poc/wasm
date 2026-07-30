import { parentPort, workerData } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import init, { WasmEngine } from "./pkg/rust_wasm_renderer.js";

const bytes = await readFile(new URL("./pkg/rust_wasm_renderer_bg.wasm", import.meta.url));
const wasm = await init({ module_or_path: bytes });
const engine = new WasmEngine();
const frames = workerData.frames;
const mode = workerData.mode;
let shared = null;

if (mode === "shared") {
  shared = new SharedArrayBuffer(frameByteLength());
  parentPort.postMessage({ type: "shared-ready", buffer: shared });
}

for (let frame = 0; frame < frames; frame += 1) {
  const frameStarted = performance.now();
  const tickStarted = performance.now();
  const input = inputForFrame(frame);
  engine.set_input(input.rotateX, input.rotateY, input.zoom, 0);
  engine.tick(1 / 60);
  const workerTickNs = nsSince(tickStarted);

  const copyStarted = performance.now();
  const buffer = mode === "shared" ? shared : new ArrayBuffer(frameByteLength());
  writeFrame(buffer, mode === "shared", frame);
  const workerCopyNs = nsSince(copyStarted);
  const workerFrameNs = nsSince(frameStarted);

  parentPort.postMessage({
    type: "frame",
    frame,
    buffer,
    workerFrameNs,
    workerTickNs,
    workerCopyNs,
    payloadBytes: frameByteLength(),
    sentUnixMs: Date.now(),
  }, mode === "shared" ? [] : [buffer]);
}

parentPort.postMessage({ type: "done" });

function frameByteLength() {
  const patchCount = engine.patches_len();
  const floatCount = 9 + patchCount * 5;
  return 16 + floatCount * Float32Array.BYTES_PER_ELEMENT;
}

function writeFrame(buffer, isShared, frame) {
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
    Atomics.store(header, 0, frame + 1);
  } else {
    header[0] = frame + 1;
  }
}

function inputForFrame(frame) {
  return {
    rotateX: frame % 180 < 90 ? 0.35 : -0.35,
    rotateY: frame % 240 < 120 ? 1.0 : -1.0,
    zoom: frame % 300 < 150 ? 0.25 : -0.25,
  };
}

function nsSince(started) {
  return Math.round((performance.now() - started) * 1_000_000);
}
