import { countTokens, decode, encode } from "gpt-tokenizer/model/gpt-4o";

// Log to both console and UI if element exists
function logMessage(message: string, type: "info" | "warn" | "error" = "info") {
  const statusEl = document.getElementById("status");
  const treeContainerEl = document.getElementById("tree-container");

  // Always log to console
  if (type === "warn") console.warn(message);
  else if (type === "error") console.error(message);
  else console.log(message);

  // Update UI if element exists
  if (statusEl) {
    statusEl.textContent = message;
    if (type === "error") statusEl.style.color = "var(--accent-danger, red)";
    else if (type === "warn")
      statusEl.style.color = "var(--accent-warning, orange)";
  }

  // Also update tree container for visibility
  if (treeContainerEl) {
    const existingContent = treeContainerEl.innerHTML;
    if (!existingContent.includes(message)) {
      treeContainerEl.innerHTML =
        `<p class="italic text-[var(--text-muted)] text-sm">${message}</p>` +
        (existingContent !==
        '<p class="italic text-[var(--text-muted)] text-sm">Initializing Tokenizer...</p>'
          ? `<div class="mt-2 text-xs text-[var(--text-muted)]">${existingContent}</div>`
          : "");
    }
  }
}

/**
 * Interface for tokenizer functions
 */
export interface Tokenizer {
  encode: (text: string) => number[];
  decode: (tokens: number[] | Uint32Array) => string;
  countTokens: (text: string) => number;
}

/**
 * Primary tokenizer using gpt-tokenizer library
 */
export const gptTokenizer: Tokenizer = {
  encode: (text: string): number[] => {
    if (!text) return [];
    return encode(text);
  },

  decode: (tokens: number[] | Uint32Array): string => {
    return decode(Array.from(tokens));
  },

  countTokens: (text: string): number => {
    if (!text) return 0;
    return countTokens(text);
  },
};

/**
 * Fallback tokenizer implementation (used only if gpt-tokenizer fails)
 */
export const fallbackTokenizer: Tokenizer = {
  encode: (text: string): number[] => {
    if (!text) return [];
    // Better approximation: split on whitespace, punctuation, and common subword boundaries
    const tokens = text.match(/\w+|\s+|[.,!?;:"'()\[\]{}]/g) || [];
    // Return array of numbers (just for interface consistency)
    return tokens.map((_, i) => i);
  },

  decode: (tokens: number[] | Uint32Array): string => {
    return Array.from(tokens).join("");
  },

  countTokens: (text: string): number => {
    if (!text) return 0;
    // More accurate approximation based on GPT tokenization patterns
    // Count plain words
    const words = text.match(/\w+/g) || [];
    const wordCount = words.length;

    // Count punctuation and whitespace separately (they're usually separate tokens)
    const punctuation = text.match(/[.,!?;:"'()\[\]{}]/g) || [];
    const whitespace = text.match(/\s+/g) || [];

    // Count some common token patterns
    const commonPatterns =
      (text.match(/https?:\/\/\S+|www\.\S+|\S+\.\S+/g) || []).length * 3;

    // Total token estimate
    const tokenEstimate =
      wordCount + punctuation.length + whitespace.length + commonPatterns;

    // Add a small factor for subword tokenization (since GPT often splits words)
    return Math.ceil(tokenEstimate * 1.3);
  },
};

/**
 * Initializes the tokenizer
 */
export async function initializeTokenizer(): Promise<Tokenizer> {
  logMessage("Initializing tokenizer...");

  try {
    // Test the gpt-tokenizer with a simple string
    const testText = "Hello, world!";
    logMessage("Testing tokenizer with sample text...");

    try {
      const testTokens = gptTokenizer.encode(testText);
      logMessage(`Tokenizer test successful: ${testTokens.length} tokens`);
      return gptTokenizer;
    } catch (e) {
      logMessage(`Error testing tokenizer: ${e}`, "error");
      throw e;
    }
  } catch (error) {
    logMessage(
      `Using fallback tokenizer due to error: ${(error as Error).message}`,
      "warn"
    );
    return fallbackTokenizer;
  }
}
