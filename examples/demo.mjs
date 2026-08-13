import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createNeedleEngine } from "../src/needle.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const modelPath = path.join(__dirname, "..", "vendor", "models", "needle2.cact");
  const toolsPath = path.join(__dirname, "tools.json");

  const modelBytes = new Uint8Array(readFileSync(modelPath));
  const toolsJson = readFileSync(toolsPath, "utf8");

  const engine = await createNeedleEngine();
  engine.loadModelBytes(modelBytes);
  engine.init("You are a helpful home-automation assistant.", toolsJson);

  const result = engine.complete("dim the living room to 30");
  console.log(result);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
