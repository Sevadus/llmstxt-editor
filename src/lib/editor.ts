import { findAndRenderDuplicates, renderTree } from "./dom-rendering";
import { parseLLMS } from "./parser";
import { editorStore } from "./store";
import {
  fallbackTokenizer,
  initializeTokenizer,
  type Tokenizer,
} from "./tokenizer";
import {
  cascadeCheck,
  disableButtons,
  toggleCollapse,
  updateParentIndeterminateStates,
  updateStatus,
  updateTokenCounts,
  updateDuplicateMasterCheckboxState, // Added import
} from "./ui-utils";

// Add type declaration for window.editorDebug
declare global {
  interface Window {
    editorDebug: any;
  }
}

// Helper for UI and console logging
function debugLog(message: string, type: "info" | "warn" | "error" = "info") {
  const statusEl = document.getElementById("status");
  const treeContainerEl = document.getElementById("tree-container");

  // Always log to console
  if (type === "warn") console.warn("[EDITOR]", message);
  else if (type === "error") console.error("[EDITOR]", message);
  else console.log("[EDITOR]", message);

  // Update UI if element exists
  if (statusEl) {
    statusEl.textContent = message;
    if (type === "error") statusEl.style.color = "var(--accent-danger, red)";
    else if (type === "warn")
      statusEl.style.color = "var(--accent-warning, orange)";
  }

  // Also update tree container for visibility
  if (treeContainerEl) {
    treeContainerEl.innerHTML = `<p class="italic text-[var(--text-muted)] text-sm">${message}</p>
      <div class="mt-4 text-xs">
        <p>Debug info:</p>
        <ul class="list-disc pl-5 space-y-1 mt-2">
          <li>Tokenizer ready: ${editorStore.getState().isTokenizerReady}</li>
          <li>Processing: ${editorStore.getState().isProcessing}</li>
          <li>WebAssembly: ${
            typeof WebAssembly !== "undefined" ? "Supported" : "Not supported"
          }</li>
          <li>Browser: ${navigator.userAgent}</li>
        </ul>
        <p class="mt-3">If stuck, try:</p>
        <ul class="list-disc pl-5 space-y-1 mt-2">
          <li><a href="#" id="forceFallbackBtn" class="text-[var(--accent-primary)]">Force fallback tokenizer</a></li>
          <li><a href="#" id="reloadPageBtn" class="text-[var(--accent-primary)]">Reload page</a></li>
        </ul>
      </div>`;

    // Add event handlers for debug buttons
    document
      .getElementById("forceFallbackBtn")
      ?.addEventListener("click", (e) => {
        e.preventDefault();
        window.editorDebug.forceFallback();
      });

    document.getElementById("reloadPageBtn")?.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.reload();
    });
  }
}

/**
 * Main editor class that handles all LLMS.txt editing functionality
 */
export class LLMSEditor {
  private tokenizer: Tokenizer | null = null;

  /**
   * Initialize the editor
   */
  async initialize(): Promise<void> {
    debugLog("Editor initialization started");
    updateStatus("Initializing tokenizer...");

    const treeContainer = document.getElementById("tree-container");
    const duplicateListContainer = document.getElementById("duplicate-list");

    if (treeContainer) {
      treeContainer.innerHTML =
        '<p class="italic text-[var(--text-muted)] text-sm">Initializing Tokenizer...</p>';
    }

    if (duplicateListContainer) {
      duplicateListContainer.innerHTML =
        '<p class="italic text-[var(--text-muted)] text-sm">Load content to find duplicates.</p>';
    }

    disableButtons(true); // Start disabled

    try {
      // Initialize the tokenizer (now using gpt-tokenizer)
      debugLog("Initializing gpt-tokenizer");
      this.tokenizer = await initializeTokenizer();
      editorStore.setTokenizerReady(true);

      debugLog("Tokenizer ready");
      updateStatus("Ready. Load an llms.txt file via URL or upload.");
    } catch (error) {
      debugLog(`Tokenizer setup error: ${(error as Error).message}`, "error");
      console.error("Tokenizer error:", error);
      this.tokenizer = fallbackTokenizer;
      editorStore.setTokenizerReady(true);
      updateStatus("Ready. Using approximate token counts.", "info");
    } finally {
      debugLog("Initialization completed, enabling UI");
      disableButtons(false);

      // Ensure placeholder is correct if tree is still empty
      const { parsedSections } = editorStore.getState();
      if (parsedSections.length === 0 && treeContainer) {
        treeContainer.innerHTML =
          '<p class="italic text-[var(--text-muted)] text-sm">Load a file or URL to see sections.</p>';
      }
    }

    // Set up event listeners after initialization
    this.setupEventListeners();

    // Add debug force functions
    this.setupDebugHelpers();
  }

  /**
   * Set up event listeners for the UI
   */
  private setupEventListeners(): void {
    // File upload
    const fileInput = document.getElementById("fileInput") as HTMLInputElement;
    if (fileInput) {
      fileInput.addEventListener("change", this.handleFileSelect.bind(this));
    }

    // URL fetch
    const fetchUrlButton = document.getElementById("fetchUrlButton");
    if (fetchUrlButton) {
      fetchUrlButton.addEventListener("click", this.handleFetchUrl.bind(this));
    }

    // Export
    const exportButton = document.getElementById("export-button");
    if (exportButton) {
      exportButton.addEventListener("click", this.handleExport.bind(this));
    }

    // Copy to clipboard
    const copyButton = document.getElementById("copy-button");
    if (copyButton) {
      copyButton.addEventListener("click", this.handleCopy.bind(this));
    }

    // Tree container (for delegate events)
    const treeContainer = document.getElementById("tree-container");
    if (treeContainer) {
      treeContainer.addEventListener("click", this.handleTreeClick.bind(this));
    }

    // Select all/none
    const selectAllButton = document.getElementById("selectAllButton");
    if (selectAllButton) {
      selectAllButton.addEventListener("click", () => this.selectAllNone(true));
    }

    const selectNoneButton = document.getElementById("selectNoneButton");
    if (selectNoneButton) {
      selectNoneButton.addEventListener("click", () =>
        this.selectAllNone(false)
      );
    }

    // Duplicate list container
    const duplicateListContainer = document.getElementById("duplicate-list");
    if (duplicateListContainer) {
      duplicateListContainer.addEventListener(
        "click",
        this.handleDuplicateListClick.bind(this)
      );
    }
  }

  /**
   * Set up debug helpers for troubleshooting
   */
  private setupDebugHelpers(): void {
    // Create global debug object
    const debugObj = {
      forceFallback: () => {
        debugLog("Forcing fallback tokenizer manually", "warn");
        this.tokenizer = fallbackTokenizer;
        editorStore.setTokenizerReady(true);
        updateStatus("Ready with fallback tokenizer.", "info");
        disableButtons(false);

        const treeContainer = document.getElementById("tree-container");
        if (treeContainer) {
          treeContainer.innerHTML =
            '<p class="italic text-[var(--text-muted)] text-sm">Fallback tokenizer enabled. Load a file or URL to see sections.</p>';
        }
      },
      getState: () => editorStore.getState(),
      logState: () => console.log("Editor state:", editorStore.getState()),
      tokenizer: this.tokenizer,
    };

    // Add to window for console access
    (window as any).editorDebug = debugObj;
  }

  /**
   * Process LLMS content
   */
  async processLLMSContent(text: string): Promise<void> {
    console.log("processLLMSContent called with text length:", text?.length);

    if (!text) {
      console.error("No text provided to processLLMSContent");
      updateStatus("Error: No content to process", "error");
      return;
    }

    const { isProcessing } = editorStore.getState();
    if (isProcessing) {
      updateStatus("Processing previous request, please wait...", "info");
      return;
    }

    editorStore.setProcessingState(true);
    updateStatus("Parsing content...");

    const treeContainer = document.getElementById("tree-container");
    const duplicateListContainer = document.getElementById("duplicate-list");

    if (treeContainer) {
      treeContainer.innerHTML =
        '<p class="italic text-[var(--text-muted)] text-sm">Parsing...</p>';
    }

    if (duplicateListContainer) {
      duplicateListContainer.innerHTML =
        '<p class="italic text-[var(--text-muted)] text-sm">Parsing...</p>';
    }

    editorStore.resetStore();
    disableButtons(true);

    // Brief pause for UI
    await new Promise((resolve) => setTimeout(resolve, 10));

    try {
      console.log("Starting to parse LLMS content...");

      if (!this.tokenizer) {
        throw new Error("Tokenizer not initialized");
      }

      // Parse the content
      const { sections, totalTokenCount } = parseLLMS(text, this.tokenizer);
      console.log(`Parsed ${sections.length} sections`);

      // Store sections in the store
      const { sectionMap } = editorStore.setSections(sections, totalTokenCount);
      console.log("Created section map");

      // Render the tree
      console.log("Rendering tree...");
      renderTree(sections);

      // Update token counts
      console.log("Updating token counts...");
      updateTokenCounts();

      // Find and render duplicates
      console.log("Finding and rendering duplicates...");
      const duplicates = findAndRenderDuplicates(sections);
      editorStore.setDuplicateTitles(duplicates);

      updateStatus(
        `Content processed: ${sections.length.toLocaleString()} sections found.`,
        "success"
      );
      disableButtons(false);
    } catch (error) {
      console.error("Processing error:", error);
      updateStatus(
        `Error processing content: ${(error as Error).message}`,
        "error"
      );

      if (treeContainer) {
        treeContainer.innerHTML =
          '<p class="italic text-[var(--text-muted)] text-sm">Error processing content.</p>';
      }

      if (duplicateListContainer) {
        duplicateListContainer.innerHTML =
          '<p class="italic text-[var(--text-muted)] text-sm">Error processing content.</p>';
      }

      disableButtons(true);
    } finally {
      editorStore.setProcessingState(false);
    }
  }

  /**
   * Handle file select event
   */
  private async handleFileSelect(event: Event): Promise<void> {
    console.log("handleFileSelect called");
    const fileInput = event.target as HTMLInputElement;
    const urlInput = document.getElementById("urlInput") as HTMLInputElement;

    if (urlInput) {
      urlInput.value = "";
    }

    const file = fileInput.files?.[0];
    if (!file) {
      console.log("No file selected");
      return;
    }

    console.log(`Loading file: ${file.name} (${file.size} bytes)`);
    updateStatus(`Loading file: ${file.name}...`);
    disableButtons(true); // Disable while reading/processing

    try {
      const reader = new FileReader();

      reader.onload = async (e) => {
        const content = e.target?.result as string;
        console.log(`File loaded, content length: ${content.length}`);

        try {
          await this.processLLMSContent(content);
        } catch (processError) {
          console.error("Error processing file content:", processError);
          updateStatus(
            `Error processing file: ${(processError as Error).message}`,
            "error"
          );
        }
      };

      reader.onerror = (e) => {
        console.error("FileReader error:", e);
        updateStatus("Error reading file.", "error");
        disableButtons(false);
        editorStore.setProcessingState(false);
      };

      reader.readAsText(file);
    } catch (error) {
      console.error("Error in file handling:", error);
      updateStatus(`Error handling file: ${(error as Error).message}`, "error");
      disableButtons(false);
      editorStore.setProcessingState(false);
    }
  }

  /**
   * Handle fetch URL event
   */
  private async handleFetchUrl(): Promise<void> {
    console.log("handleFetchUrl called");
    const urlInput = document.getElementById("urlInput") as HTMLInputElement;
    const fileInput = document.getElementById("fileInput") as HTMLInputElement;

    if (fileInput) {
      fileInput.value = "";
    }

    const url = urlInput.value.trim();
    if (!url) {
      console.log("No URL provided");
      updateStatus("Please enter a URL.", "error");
      return;
    }

    try {
      new URL(url);
      console.log(`URL appears valid: ${url}`);
    } catch (error) {
      console.error("Invalid URL:", error);
      updateStatus("Invalid URL entered.", "error");
      return;
    }

    updateStatus(`Fetching content from ${url}...`);
    disableButtons(true); // Disable during fetch/process

    const treeContainer = document.getElementById("tree-container");
    const duplicateListContainer = document.getElementById("duplicate-list");

    if (treeContainer) {
      treeContainer.innerHTML =
        '<p class="italic text-[var(--text-muted)] text-sm">Loading...</p>';
    }

    if (duplicateListContainer) {
      duplicateListContainer.innerHTML =
        '<p class="italic text-[var(--text-muted)] text-sm">Loading...</p>';
    }

    try {
      const response = await fetch(url);
      console.log("Fetch response:", response);

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const text = await response.text();
      console.log(`Fetched content length: ${text.length}`);

      await this.processLLMSContent(text);
    } catch (error) {
      console.error("Fetch error:", error);
      updateStatus(
        `Error fetching from URL: ${(error as Error).message}.`,
        "error"
      );

      if (treeContainer) {
        treeContainer.innerHTML =
          '<p class="italic text-[var(--text-muted)] text-sm">Error loading content from URL.</p>';
      }

      if (duplicateListContainer) {
        duplicateListContainer.innerHTML =
          '<p class="italic text-[var(--text-muted)] text-sm">Error loading duplicates.</p>';
      }

      disableButtons(false);
      editorStore.setProcessingState(false);
    }
  }

  /**
   * Handle export event
   */
  private handleExport(): void {
    const { isProcessing, parsedSections } = editorStore.getState();

    if (isProcessing) {
      updateStatus("Still processing, please wait.", "info");
      return;
    }

    if (!parsedSections || parsedSections.length === 0) {
      updateStatus("No data to export.", "error");
      return;
    }

    let outputContent = "";
    let sectionsIncludedCount = 0;
    let finalTokenCount = 0;

    parsedSections.forEach((section) => {
      if (section.checkbox && section.checkbox.checked) {
        sectionsIncludedCount++;
        finalTokenCount += section.exclusiveTokenCount;
        const heading = `${"#".repeat(section.level)} ${section.title}\n`;
        outputContent += heading;
        outputContent += section.content.join("\n") + "\n\n";
      }
    });

    outputContent = outputContent.trimEnd() + "\n";

    if (sectionsIncludedCount === 0) {
      updateStatus("No sections selected for export.", "error");
      return;
    }

    updateStatus(
      `Exporting ${sectionsIncludedCount.toLocaleString()} sections (~${finalTokenCount.toLocaleString()} exclusive tokens)...`
    );

    const blob = new Blob([outputContent], {
      type: "text/plain;charset=utf-8",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "llms_edited.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    updateStatus(
      `Export complete: llms_edited.txt (~${finalTokenCount.toLocaleString()} exclusive tokens).`,
      "success"
    );
  }
  /**
   * Handle copy to clipboard event
   */
  private async handleCopy(): Promise<void> {
    const { isProcessing, parsedSections } = editorStore.getState();

    if (isProcessing) {
      updateStatus("Still processing, please wait.", "info");
      return;
    }

    if (!parsedSections || parsedSections.length === 0) {
      updateStatus("No data to copy.", "error");
      return;
    }

    let outputContent = "";
    let sectionsIncludedCount = 0;
    let finalTokenCount = 0; // Keep track for potential status message

    parsedSections.forEach((section) => {
      if (section.checkbox && section.checkbox.checked) {
        sectionsIncludedCount++;
        finalTokenCount += section.exclusiveTokenCount;
        const heading = `${"#".repeat(section.level)} ${section.title}\n`;
        outputContent += heading;
        outputContent += section.content.join("\n") + "\n\n";
      }
    });

    outputContent = outputContent.trimEnd() + "\n";

    if (sectionsIncludedCount === 0) {
      updateStatus("No sections selected to copy.", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(outputContent);
      updateStatus(`Copied ${sectionsIncludedCount.toLocaleString()} sections to clipboard.`, "success");
    } catch (err) {
      console.error("Failed to copy text: ", err);
      updateStatus("Failed to copy text to clipboard.", "error");
    }
  }


  /**
   * Handle tree click event
   */
  private handleTreeClick(event: MouseEvent): void {
    console.log("Tree click detected", event.target);

    const { isProcessing, sectionMap } = editorStore.getState();
    if (isProcessing) {
      console.log("Processing in progress, ignoring click");
      return;
    }

    const target = event.target as HTMLElement;
    const treeItem = target.closest(".tree-item") as HTMLElement;

    if (!treeItem) {
      console.log("No tree item found in click target ancestry");
      return;
    }

    const sectionId = treeItem.dataset.id;
    console.log(`Clicked on tree item with section ID: ${sectionId}`);

    if (!sectionId) {
      console.warn("Tree item found but no section ID");
      return;
    }

    // Handle Toggle Icon Click first
    if (target.classList.contains("toggle-icon")) {
      console.log("Toggle icon clicked");
      toggleCollapse(sectionId);
      return;
    }

    // Handle Checkbox Click (or label/content clicks)
    let checkbox: HTMLInputElement | null = null;

    if (
      target.nodeName === "INPUT" &&
      (target as HTMLInputElement).type === "checkbox" &&
      (target as HTMLInputElement).dataset.id === sectionId
    ) {
      console.log("Direct checkbox click detected");
      checkbox = target as HTMLInputElement;
    } else {
      const itemContent = target.closest(".item-content");
      const isTokenArea = target.closest(".token-count");

      if (itemContent && !isTokenArea) {
        console.log("Item content clicked (not token area)");
        checkbox = treeItem.querySelector(
          `input[type="checkbox"][data-id="${sectionId}"]`
        );

        if (checkbox && !target.closest("label")) {
          // Manually toggle only if clicking the div, not the label
          console.log("Content area clicked, manually toggling checkbox");
          checkbox.checked = !checkbox.checked;
        } else if (!checkbox) {
          console.warn("Could not find checkbox for section", sectionId);
          return;
        }
        // If label was clicked, checkbox state is already toggled by browser
      } else {
        console.log(
          "Click wasn't on checkbox, toggle icon, label or content area"
        );
        return;
      }
    }

    // Proceed with logic using the final checkbox state
    if (!checkbox) return;

    const isChecked = checkbox.checked;
    console.log(
      `Checkbox for section ${sectionId} is now ${
        isChecked ? "checked" : "unchecked"
      }`
    );

    // Use requestAnimationFrame for better performance with DOM updates
    requestAnimationFrame(() => {
      // First cascade the change down to all children
      cascadeCheck(sectionId, isChecked, sectionMap);

      // Then update parent states
      updateParentIndeterminateStates(sectionId, sectionMap);

      // Update duplicate states if needed
      const section = sectionMap.get(sectionId);
      if (section) {
        const dupKey = `${section.title}::${section.level}`;
        const { duplicateTitles } = editorStore.getState();
        if (duplicateTitles[dupKey]) {
          updateDuplicateMasterCheckboxState(dupKey);
        }
      }

      // Finally update token counts
      updateTokenCounts();
    });
  }

  /**
   * Handle duplicate list click event
   */
  private handleDuplicateListClick(event: MouseEvent): void {
    const { isProcessing, sectionMap } = editorStore.getState();
    if (isProcessing) return;

    const target = event.target as HTMLElement;
    let checkbox: HTMLInputElement | null = null;
    let duplicateKey: string | undefined;

    if (
      target.nodeName === "INPUT" &&
      (target as HTMLInputElement).type === "checkbox" &&
      (target as HTMLInputElement).dataset.duplicateKey
    ) {
      checkbox = target as HTMLInputElement;
      duplicateKey = checkbox.dataset.duplicateKey;
    } else {
      const label = target.closest("label");
      if (label && label.htmlFor.startsWith("dup-checkbox-")) {
        checkbox = document.getElementById(label.htmlFor) as HTMLInputElement;
        if (checkbox) {
          // Let browser handle the check toggle via label click
          duplicateKey = checkbox.dataset.duplicateKey;
        }
      }
    }

    if (checkbox && duplicateKey) {
      const isChecked = checkbox.checked; // State *after* click
      const { duplicateTitles } = editorStore.getState();
      const duplicateInfo = duplicateTitles[duplicateKey];

      if (duplicateInfo) {
        checkbox.indeterminate = false; // Direct click clears indeterminate
        duplicateInfo.ids.forEach((instanceId) => {
          cascadeCheck(instanceId, isChecked, sectionMap);
          updateParentIndeterminateStates(instanceId, sectionMap); // Update each instance's parents
        });
        updateTokenCounts();
      }
    }
  }

  /**
   * Select all or none of the sections
   */
  private selectAllNone(select = true): void {
    const { isProcessing, parsedSections, duplicateTitles } =
      editorStore.getState();
    if (isProcessing) return;

    parsedSections.forEach((section) => {
      if (section.checkbox) {
        section.checkbox.checked = select;
        section.checkbox.indeterminate = false;
      }
    });

    Object.values(duplicateTitles).forEach((dupInfo) => {
      if (dupInfo.checkbox) {
        dupInfo.checkbox.checked = select;
        dupInfo.checkbox.indeterminate = false;
      }
    });

    updateTokenCounts();
    updateStatus(
      select ? "All sections selected." : "All sections deselected."
    );
  }
}

// Create singleton instance
export const editor = new LLMSEditor();
