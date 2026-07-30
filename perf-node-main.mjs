import { Worker } from "node:worker_threads";
import { performance } from "node:perf_hooks";

const args = process.argv.slice(2);
const frames = Number(valueAfter(args, "--frames") ?? 600);
const mode = valueAfter(args, "--mode") ?? "transfer";
const target = `wasm-worker-${mode}`;

const samples = [];
const readSamples = [];
let received = 0;

log("start", { frames, mode });

const worker = new Worker(new URL("./perf-node-worker.mjs", import.meta.url), {
  type: "module",
  workerData: { frames, mode },
});

worker.on("message", (message) => {
  if (message.type === "shared-ready") {
    log("shared_ready", { byteLength: message.buffer.byteLength });
    return;
  }

  if (message.type === "frame") {
    const readStarted = performance.now();
    if (mode === "shared") {
      const header = new Int32Array(message.buffer, 0, 4);
      const floats = new Float32Array(message.buffer, 16);
      const patchCount = Atomics.load(header, 1);
      // Touch the frame so this benchmark includes main-thread read cost.
      volatileRead(floats, 9 + patchCount * 5);
    } else {
      const header = new Int32Array(message.buffer, 0, 4);
      const floats = new Float32Array(message.buffer, 16);
      volatileRead(floats, 9 + header[1] * 5);
    }
    const readNs = Math.round((performance.now() - readStarted) * 1_000_000);
    readSamples.push(readNs);
    samples.push(message.workerFrameNs);
    received += 1;

    log("frame", {
      frame: message.frame,
      workerFrameNs: message.workerFrameNs,
      workerTickNs: message.workerTickNs,
      workerCopyNs: message.workerCopyNs,
      mainReadNs: readNs,
      payloadBytes: message.payloadBytes,
      latencyMs: nowMs() - message.sentUnixMs,
    });
    return;
  }

  if (message.type === "done") {
    log("summary", {
      frames,
      received,
      workerAvgNs: avg(samples),
      workerP50Ns: percentile(samples, 0.50),
      workerP95Ns: percentile(samples, 0.95),
      mainReadAvgNs: avg(readSamples),
      mainReadP95Ns: percentile(readSamples, 0.95),
    });
    worker.terminate();
  }
});

worker.on("error", (error) => {
  log("error", { message: error.message });
  process.exitCode = 1;
});

function valueAfter(values, flag) {
  const index = values.indexOf(flag);
  return index >= 0 ? values[index + 1] : undefined;
}

function volatileRead(floats, count) {
  let total = 0;
  for (let index = 0; index < count; index += 8) {
    total += floats[index];
  }
  globalThis.__rustPerfSink = total;
}

function avg(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.round((sorted.length - 1) * p)];
}

function log(phase, fields) {
  console.log(JSON.stringify({
    ts_unix_ms: nowMs(),
    target,
    phase,
    ...fields,
  }));
}

function nowMs() {
  return Date.now();
}

