import { editor } from "./editor";

/**
 * Main entry point for the LLMS.txt Editor
 */
document.addEventListener("DOMContentLoaded", async () => {
  console.log("LLMS.txt Editor initializing...");
  try {
    await editor.initialize();
    console.log("LLMS.txt Editor initialized successfully");
  } catch (error) {
    console.error("Error initializing LLMS.txt Editor:", error);
  }
});
