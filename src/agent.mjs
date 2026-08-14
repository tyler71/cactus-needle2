const DEFAULT_MAX_TOKENS = 256;

// Recognized system-fact keys, in the order the model card documents them.
const SYSTEM_FACT_KEYS = [
  "date",
  "locale",
  "device",
  "battery",
  "network",
  "location",
  "user",
  "assistant",
];

/**
 * Pairs a manually-authored JSON-schema tool definition with a JS
 * implementation function. JS has no runtime type-hint introspection, so
 * (unlike the Python `@needle.tool` decorator) the schema is authored
 * explicitly here, in the same shape Needle's C ABI expects:
 * `{ name, description, parameters }`.
 */
export function tool(definition, fn) {
  if (!definition || typeof definition.name !== "string") {
    throw new TypeError("tool() definition requires a string `name`");
  }
  if (typeof fn !== "function") {
    throw new TypeError("tool() requires an implementation function");
  }
  return { ...definition, fn };
}

function toToolSchema(tools) {
  return tools.map(({ fn, ...schema }) => schema);
}

function toToolMap(tools) {
  const map = new Map();
  for (const t of tools) {
    if (typeof t.fn === "function") {
      map.set(t.name, t.fn);
    }
  }
  return map;
}

/**
 * Binds a set of tool()-created descriptors and a system prompt to an
 * already loadModelBytes()-loaded engine, and returns a session-oriented
 * agent mirroring the Python `Needle` class: `.complete()` returns the raw
 * parsed response, `.run()` additionally auto-executes matching JS tool
 * functions, and `.reset()` clears the conversation while keeping the
 * tools/model loaded.
 */
export function createNeedle(engine, { tools = [], system = "", toolIndexPath = "" } = {}) {
  const toolsSchema = toToolSchema(tools);
  const toolFns = toToolMap(tools);
  let initialized = false;

  async function ensureInit() {
    if (!initialized) {
      await engine.init(system, toolsSchema, toolIndexPath);
      initialized = true;
    }
  }

  async function complete(input, options = {}) {
    const { maxTokens = DEFAULT_MAX_TOKENS, outCapacity } = options;
    await ensureInit();
    const raw = await engine.complete(input, maxTokens, outCapacity);
    return JSON.parse(raw);
  }

  async function run(input, options = {}) {
    const response = await complete(input, options);
    if (response.type === "call" && Array.isArray(response.function_calls)) {
      response.results = await Promise.all(
        response.function_calls.map(async (call) => {
          const fn = toolFns.get(call.name);
          if (!fn) {
            return { name: call.name, error: `no tool function registered for "${call.name}"` };
          }
          return { name: call.name, result: await fn(call.arguments ?? {}) };
        }),
      );
    }
    return response;
  }

  async function reset() {
    await engine.reset();
  }

  return { complete, run, reset };
}

/**
 * Convenience wrapper for structured-data extraction: declares `schema` as
 * the sole available tool, so the model's returned call arguments are
 * guaranteed to conform to it. Returns the extracted fields directly, or
 * `null` if the model returned no call.
 */
export async function extract(engine, text, schema, options = {}) {
  const { maxTokens = DEFAULT_MAX_TOKENS, outCapacity, toolIndexPath = "" } = options;
  const raw = await engine.run("", [schema], text, { toolIndexPath, maxTokens, outCapacity });
  const response = JSON.parse(raw);
  return response.function_calls?.[0]?.arguments ?? null;
}

/**
 * Builds the `"key: value; key: value"` system-facts string documented on
 * the model card, from only the recognized, defined keys.
 */
export function formatSystemFacts(facts = {}) {
  return SYSTEM_FACT_KEYS.filter((key) => facts[key] !== undefined && facts[key] !== null)
    .map((key) => `${key}: ${facts[key]}`)
    .join("; ");
}
