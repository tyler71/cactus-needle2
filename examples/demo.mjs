import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createNeedleEngine } from "../src/needle.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Any source that yields a Blob works here (fetch, a browser file input, IndexedDB, etc.)
const MODEL_URL = "https://huggingface.co/Cactus-Compute/needle2/resolve/main/needle2.cact";

async function main() {
  const toolsPath = path.join(__dirname, "tools.json");

  const modelBlob = await fetch(MODEL_URL).then((r) => r.blob());
  const toolsJson = readFileSync(toolsPath, "utf8");

  const engine = await createNeedleEngine();
  await engine.loadModelBytes(modelBlob);

  const result = await engine.run(
    "You are a helpful home-automation assistant.",
    toolsJson,
    "dim the living room to 30",
  );
  console.log(result);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
