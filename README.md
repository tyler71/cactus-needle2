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
engine.init("You are a helpful assistant.", tools);

const result = engine.complete("what's the weather in Paris?");
console.log(result);
```

See `examples/demo.mjs` in the source repo for a runnable version of this example.

## API

```ts
function createNeedleEngine(): Promise<NeedleEngine>;

interface NeedleEngine {
  // Loads a compiled `.cact` model artifact into the wasm runtime. Throws on failure.
  loadModelBytes(bytes: Uint8Array): number;

  // Initializes a session with a system prompt and a JSON (or JSON-string) tool schema list.
  init(systemPrompt: string, toolsJson: string | unknown[], toolIndexPath?: string): number;

  // Runs completion for the given input, returning the raw model output (typically a JSON tool call).
  complete(input: string, maxTokens?: number, outCapacity?: number): string;

  // Resets internal session state.
  reset(): void;
}
```

Full type definitions: [`src/needle.d.ts`](./src/needle.d.ts).

## License

The wrapper code in this package is licensed under [Apache-2.0](./LICENSE).

The vendored WASM build (`vendor/wasm/`) is derived from Cactus Compute's Needle 2, also licensed under Apache-2.0 — see [`vendor/LICENSE-needle2`](./vendor/LICENSE-needle2). The model weights and tokenizer (downloaded separately, not included in this package) are subject to the license terms on their [Hugging Face page](https://huggingface.co/Cactus-Compute/needle2/tree/main).
