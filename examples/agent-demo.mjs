import { createNeedleEngine, tool, createNeedle, extract } from "../src/needle.mjs";

const MODEL_URL = "https://huggingface.co/Cactus-Compute/needle2/resolve/main/needle2.cact";

async function main() {
  const modelBlob = await fetch(MODEL_URL).then((r) => r.blob());
  const engine = await createNeedleEngine();
  await engine.loadModelBytes(modelBlob);

  // High-level API: pair a JSON-schema tool definition with a JS function.
  const getWeather = tool(
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
    ({ city }) => ({ city, temp_c: 27, sky: "clear" }),
  );

  const agent = createNeedle(engine, {
    system: "You are a helpful assistant.",
    tools: [getWeather],
  });

  // .run() auto-executes the matching tool function and attaches `results`.
  const runResult = await agent.run("what's it like in Lagos right now?");
  console.log("run():", runResult.reasoning, runResult.results);

  // .complete() returns the raw response without executing anything.
  const completeResult = await agent.complete("what's it like in Nairobi right now?");
  console.log("complete():", completeResult.function_calls);

  // extract(): declare a schema as the sole tool to pull structured fields out of text.
  const invoiceSchema = {
    name: "invoice",
    description: "An invoice shared as text.",
    parameters: {
      type: "object",
      properties: {
        vendor: { type: "string" },
        total: { type: "number" },
        due_date: { type: "string" },
      },
      required: ["vendor", "total"],
    },
  };
  const invoice = await extract(
    engine,
    "Invoice from Acme Corp, $1,200.00, due 2026-09-01",
    invoiceSchema,
  );
  console.log("extract():", invoice);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
