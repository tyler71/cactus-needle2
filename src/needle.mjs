import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WASM_DIR = path.join(__dirname, "..", "vendor", "wasm");
const require = createRequire(import.meta.url);
const createNeedle = require("../vendor/wasm/needle.js");

const DEFAULT_OUT_CAPACITY = 8192;

/**
 * Boots the Emscripten module and returns a small JS wrapper around the
 * needle_init / needle_load / needle_complete / needle_reset C ABI
 * (see vendor/wasm/needle.h).
 */
export async function createNeedleEngine() {
  const Module = await createNeedle({
    locateFile: (file) => path.join(WASM_DIR, file),
  });

  const _init = Module.cwrap("needle_init", "number", [
    "string",
    "string",
    "string",
  ]);
  const _complete = Module.cwrap("needle_complete", "number", [
    "string",
    "number",
    "number",
    "number",
  ]);
  const _reset = Module.cwrap("needle_reset", null, []);

  // needle_load's length param is `unsigned long long`; depending on
  // whether this build was compiled with WASM_BIGINT, the wasm boundary
  // expects either a plain JS number or a BigInt for that arg. Try the
  // plain-number path first (common default) and fall back to BigInt.
  function callNeedleLoad(ptr, len) {
    try {
      return Module._needle_load(ptr, len);
    } catch (err) {
      if (err instanceof TypeError) {
        return Module._needle_load(ptr, BigInt(len));
      }
      throw err;
    }
  }

  // The WASM module is a single shared instance; only one call may touch it
  // at a time. This FIFO queue serializes every public operation so
  // concurrent callers can't interleave each other's WASM state.
  let queue = Promise.resolve();
  function enqueue(fn) {
    const run = queue.then(fn, fn);
    queue = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  async function loadModelBytesUnlocked(blob) {
    if (!(blob instanceof Blob)) {
      throw new TypeError("loadModelBytes expects a Blob");
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const ptr = Module._malloc(bytes.length);
    try {
      Module.HEAPU8.set(bytes, ptr);
      const rc = callNeedleLoad(ptr, bytes.length);
      if (rc < 0) {
        throw new Error(`needle_load failed with code ${rc}`);
      }
      return rc;
    } finally {
      Module._free(ptr);
    }
  }

  function initUnlocked(systemPrompt, toolsJson, toolIndexPath = "") {
    const toolsStr =
      typeof toolsJson === "string" ? toolsJson : JSON.stringify(toolsJson);
    const rc = _init(systemPrompt ?? "", toolsStr, toolIndexPath ?? "");
    if (rc < 0) {
      throw new Error(`needle_init failed with code ${rc}`);
    }
    return rc;
  }

  function completeUnlocked(
    input,
    maxTokens = 256,
    outCapacity = DEFAULT_OUT_CAPACITY,
  ) {
    const outPtr = Module._malloc(outCapacity);
    try {
      const rc = _complete(input, maxTokens, outPtr, outCapacity);
      if (rc < 0) {
        throw new Error(`needle_complete failed with code ${rc}`);
      }
      return Module.UTF8ToString(outPtr);
    } finally {
      Module._free(outPtr);
    }
  }

  function resetUnlocked() {
    _reset();
  }

  function loadModelBytes(blob) {
    return enqueue(() => loadModelBytesUnlocked(blob));
  }

  // Session-oriented primitives, queued but *not* auto-reset: unlike run(),
  // these let a caller keep one init() alive across several complete()
  // calls (multi-turn tool-calling sessions), only reset()-ing at
  // conversation boundaries. Still serialized through the same queue as
  // run()/loadModelBytes(), so sessions and one-shot calls can't interleave.
  function init(systemPrompt, toolsJson, toolIndexPath = "") {
    return enqueue(() => initUnlocked(systemPrompt, toolsJson, toolIndexPath));
  }

  function complete(input, maxTokens, outCapacity) {
    return enqueue(() => completeUnlocked(input, maxTokens, outCapacity));
  }

  function reset() {
    return enqueue(() => resetUnlocked());
  }

  // Stateless per call, like needle-rs v1's `run(prompt, toolsJson)`: each
  // call does init -> complete -> reset as one atomic unit against the
  // shared WASM instance, so no session state is ever left for another
  // queued call to observe. reset() always runs, even on failure, so a
  // failed call can't leave dangling state behind.
  function run(systemPrompt, toolsJson, input, options = {}) {
    const { toolIndexPath, maxTokens, outCapacity } = options;
    return enqueue(() => {
      try {
        initUnlocked(systemPrompt, toolsJson, toolIndexPath);
        return completeUnlocked(input, maxTokens, outCapacity);
      } finally {
        resetUnlocked();
      }
    });
  }

  return { loadModelBytes, run, init, complete, reset };
}

export { tool, createNeedle, extract, formatSystemFacts } from "./agent.mjs";

export default createNeedleEngine;
