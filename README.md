# @tyler71/cactus-needle2

A minimal Node.js wrapper around a WASM build of [Cactus Compute's Needle 2](https://huggingface.co/Cactus-Compute/needle2/tree/main), a small tool-calling model.

## Install

```bash
npm install @tyler71/cactus-needle2
```

This package ships the compiled WASM runtime (`vendor/wasm/`) and the JS wrapper (`src/needle.mjs`). It does **not** include the model weights or tokenizer — see below.

## Getting the model

`loadModelBytes()` takes a [`Blob`](https://developer.mozilla.org/en-US/docs/Web/API/Blob) containing the compiled `.cact` model — it doesn't matter how you obtain it: `fetch(url).blob()`, a browser `<input type="file">`, IndexedDB, or `new Blob([readFileSync(path)])` for a local file all work.

The model weights and tokenizer assets are published on Cactus Compute's Hugging Face repo:

https://huggingface.co/Cactus-Compute/needle2/tree/main

- `needle2.cact` — the model weights, loaded at runtime via `loadModelBytes()`
- `tokenizer.model` / `tokenizer.vocab` — tokenizer assets (not currently consumed by this JS API)

## Usage

```js
import { readFileSync } from "node:fs";
import { createNeedleEngine } from "@tyler71/cactus-needle2";

const modelBlob = await fetch(
  "https://huggingface.co/Cactus-Compute/needle2/resolve/main/needle2.cact",
).then((r) => r.blob());

const tools = [
  {
    name: "get_weather",
    description: "Get the current weather for a given city.",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "The city to get weather for." },
      },
      required: ["city"],
    },
  },
];

const engine = await createNeedleEngine();
await engine.loadModelBytes(modelBlob);

const result = await engine.run(
  "You are a helpful assistant.",
  tools,
  "what's the weather in Paris?",
);
console.log(result);
```

Each `run()` call is stateless and self-contained (it internally initializes, completes, and
resets the session), so it's safe to call concurrently on the same engine instance — concurrent
calls are queued rather than interleaved.

See `examples/demo.mjs` in the source repo for a runnable version of this example.

## High-level agent API

For multi-turn tool-calling sessions and structured extraction, `tool()` / `createNeedle()` /
`extract()` wrap the low-level engine with an API closer to Cactus Compute's Python package.
JS has no runtime type-hint introspection, so tool schemas are authored explicitly (the same
JSON-schema shape as the low-level `tools` list above) instead of derived from function
signatures.

```js
import { createNeedleEngine, tool, createNeedle, extract } from "@tyler71/cactus-needle2";

const engine = await createNeedleEngine();
await engine.loadModelBytes(modelBlob);

const getWeather = tool(
  {
    name: "get_weather",
    description: "Get the current weather for a given city.",
    parameters: {
      type: "object",
      properties: { city: { type: "string", description: "The city to get weather for." } },
      required: ["city"],
    },
  },
  ({ city }) => ({ city, temp_c: 27, sky: "clear" }),
);

const agent = createNeedle(engine, {
  system: "You are a helpful assistant.",
  tools: [getWeather],
});

// run() auto-executes matching tool functions and attaches a `results` array.
const result = await agent.run("what's it like in Lagos right now?");
console.log(result.reasoning, result.results);

// complete() returns the raw response without executing anything.
const raw = await agent.complete("what's it like in Nairobi right now?");

// reset() clears the conversation; tools and the loaded model stay in place.
await agent.reset();
```

`extract()` reuses the same tool-calling mechanism for structured-data extraction: declare a
single schema as the only available tool, and the model's returned call arguments — guaranteed
to conform to that schema — are returned directly:

```js
const invoice = await extract(
  engine,
  "Invoice from Acme Corp, $1,200.00, due 2026-09-01",
  {
    name: "invoice",
    description: "An invoice shared as text.",
    parameters: {
      type: "object",
      properties: { vendor: { type: "string" }, total: { type: "number" } },
      required: ["vendor", "total"],
    },
  },
);
console.log(invoice.vendor, invoice.total); // -> Acme Corp 1200
```

`formatSystemFacts({ date, locale, device, battery, network, location, user, assistant })`
builds the `"date: ...; locale: ...; ..."` system-facts string, for passing environment state
to the model as data rather than instructions (via `system` on `createNeedle`).

See `examples/agent-demo.mjs` for a runnable version of these examples.

## API

```ts
function createNeedleEngine(): Promise<NeedleEngine>;

interface NeedleEngine {
  // Loads a compiled `.cact` model artifact into the wasm runtime. Throws on failure.
  loadModelBytes(bytes: Uint8Array): number;

  // Runs a single completion against a system prompt, JSON (or JSON-string) tool schema
  // list, and input, returning the raw model output (typically a JSON tool call).
  run(
    systemPrompt: string,
    toolsJson: string | unknown[],
    input: string,
    options?: { toolIndexPath?: string; maxTokens?: number; outCapacity?: number },
  ): Promise<string>;

  // Session primitives for multi-turn use, queued but not auto-reset per call.
  init(systemPrompt: string, toolsJson: string | unknown[], toolIndexPath?: string): Promise<number>;
  complete(input: string, maxTokens?: number, outCapacity?: number): Promise<string>;
  reset(): Promise<void>;
}

function tool(
  definition: { name: string; description?: string; parameters?: Record<string, unknown> },
  fn: (args: Record<string, unknown>) => unknown | Promise<unknown>,
): Tool;

function createNeedle(
  engine: NeedleEngine,
  options?: { tools?: Tool[]; system?: string; toolIndexPath?: string },
): Needle;

interface Needle {
  complete(input: string, options?: { maxTokens?: number; outCapacity?: number }): Promise<NeedleResponse>;
  run(input: string, options?: { maxTokens?: number; outCapacity?: number }): Promise<NeedleResponse>;
  reset(): Promise<void>;
}

function extract(
  engine: NeedleEngine,
  text: string,
  schema: { name: string; description?: string; parameters?: Record<string, unknown> },
  options?: { toolIndexPath?: string; maxTokens?: number; outCapacity?: number },
): Promise<Record<string, unknown> | null>;

function formatSystemFacts(facts?: {
  date?: string; locale?: string; device?: string; battery?: string;
  network?: string; location?: string; user?: string; assistant?: string;
}): string;
```

Full type definitions: [`src/needle.d.ts`](./src/needle.d.ts).

## License

The wrapper code in this package is licensed under [Apache-2.0](./LICENSE).

The vendored WASM build (`vendor/wasm/`) is derived from Cactus Compute's Needle 2, also licensed under Apache-2.0 — see [`vendor/LICENSE-needle2`](./vendor/LICENSE-needle2). The model weights and tokenizer (downloaded separately, not included in this package) are subject to the license terms on their [Hugging Face page](https://huggingface.co/Cactus-Compute/needle2/tree/main).
