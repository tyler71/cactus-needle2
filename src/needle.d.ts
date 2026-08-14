export interface NeedleRunOptions {
  toolIndexPath?: string;
  maxTokens?: number;
  outCapacity?: number;
}

export interface NeedleEngine {
  /** Loads a compiled `.cact` model artifact into the wasm runtime. Throws on failure. */
  loadModelBytes(blob: Blob): Promise<number>;

  /**
   * Runs a single completion against a system prompt, JSON (or JSON-string) tool schema
   * list, and input, returning the raw model output (typically a JSON tool call).
   *
   * Each call is fully self-contained (internally does init -> complete -> reset) and safe
   * to call concurrently: concurrent calls against the same engine are queued, not
   * interleaved.
   */
  run(
    systemPrompt: string,
    toolsJson: string | unknown[],
    input: string,
    options?: NeedleRunOptions,
  ): Promise<string>;

  /**
   * Initializes a session with a system prompt and a JSON (or JSON-string) tool schema
   * list, without resetting afterward. Combine with `complete`/`reset` for multi-turn
   * sessions; queued against the same lock as `run`/`loadModelBytes`.
   */
  init(systemPrompt: string, toolsJson: string | unknown[], toolIndexPath?: string): Promise<number>;

  /** Runs completion for the given input against the current session, without resetting. */
  complete(input: string, maxTokens?: number, outCapacity?: number): Promise<string>;

  /** Resets session state (conversation only — tools/model stay loaded). */
  reset(): Promise<void>;
}

export function createNeedleEngine(): Promise<NeedleEngine>;
export default createNeedleEngine;

/** JSON-schema tool definition, in the shape Needle's C ABI expects. */
export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

/** A tool() descriptor: a ToolDefinition paired with its JS implementation. */
export interface Tool extends ToolDefinition {
  fn: (args: Record<string, unknown>) => unknown | Promise<unknown>;
}

/** Pairs a JSON-schema tool definition with a JS implementation function. */
export function tool(
  definition: ToolDefinition,
  fn: (args: Record<string, unknown>) => unknown | Promise<unknown>,
): Tool;

export interface NeedleFunctionCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface NeedleToolResult {
  name: string;
  result?: unknown;
  error?: string;
}

export interface NeedleResponse {
  type: "call" | string;
  success: boolean;
  error: string | null;
  error_code: string | null;
  function_calls: NeedleFunctionCall[];
  reasoning: string;
  confidence: number;
  prefill_tps: number;
  decode_tps: number;
  peak_ram_mb: number;
  /** Added by `Needle.run()` when `type === "call"`; absent from raw WASM output. */
  results?: NeedleToolResult[];
}

export interface NeedleCompleteOptions {
  maxTokens?: number;
  outCapacity?: number;
}

export interface Needle {
  /** Runs one turn and returns the raw parsed response — no tool execution. */
  complete(input: string, options?: NeedleCompleteOptions): Promise<NeedleResponse>;

  /** Runs one turn and auto-executes any matching registered tool functions. */
  run(input: string, options?: NeedleCompleteOptions): Promise<NeedleResponse>;

  /** Clears conversation state; tools and the loaded model are unaffected. */
  reset(): Promise<void>;
}

export interface CreateNeedleOptions {
  tools?: Tool[];
  system?: string;
  toolIndexPath?: string;
}

/** Binds tools and a system prompt to a loaded engine, returning a session-oriented agent. */
export function createNeedle(engine: NeedleEngine, options?: CreateNeedleOptions): Needle;

/**
 * Structured-data extraction: declares `schema` as the sole available tool and returns
 * the extracted fields directly (or `null` if the model returned no call).
 */
export function extract(
  engine: NeedleEngine,
  text: string,
  schema: ToolDefinition,
  options?: NeedleRunOptions,
): Promise<Record<string, unknown> | null>;

export interface SystemFacts {
  date?: string;
  locale?: string;
  device?: string;
  battery?: string;
  network?: string;
  location?: string;
  user?: string;
  assistant?: string;
}

/** Builds the `"key: value; key: value"` system-facts string from recognized keys. */
export function formatSystemFacts(facts?: SystemFacts): string;
