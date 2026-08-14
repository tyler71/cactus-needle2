export interface NeedleEngine {
  /** Loads a compiled `.cact` model artifact into the wasm runtime. Throws on failure. */
  loadModelBytes(blob: Blob): Promise<number>;

  /** Initializes a session with a system prompt and a JSON (or JSON-string) tool schema list. */
  init(systemPrompt: string, toolsJson: string | unknown[], toolIndexPath?: string): number;

  /** Runs completion for the given input, returning the raw model output (typically a JSON tool call). */
  complete(input: string, maxTokens?: number, outCapacity?: number): string;

  /** Resets internal session state. */
  reset(): void;
}

export function createNeedleEngine(): Promise<NeedleEngine>;
export default createNeedleEngine;
