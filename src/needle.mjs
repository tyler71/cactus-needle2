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

  async function loadModelBytes(blob) {
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

  function init(systemPrompt, toolsJson, toolIndexPath = "") {
    const toolsStr =
      typeof toolsJson === "string" ? toolsJson : JSON.stringify(toolsJson);
    const rc = _init(systemPrompt ?? "", toolsStr, toolIndexPath ?? "");
    if (rc < 0) {
      throw new Error(`needle_init failed with code ${rc}`);
    }
    return rc;
  }

  function complete(input, maxTokens = 256, outCapacity = DEFAULT_OUT_CAPACITY) {
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

  function reset() {
    _reset();
  }

  return { loadModelBytes, init, complete, reset };
}

export default createNeedleEngine;
