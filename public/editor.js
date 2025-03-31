/**
 * LLMS.txt Editor Script
 * Enhanced tokenization and section management for LLM prompts
 */

// --- Global Variables ---
let parsedSections = [];
let sectionMap = new Map(); // For quick ID lookup
let duplicateTitles = {};
let totalOriginalTokenCount = 0;
let tiktokenEncoder = null;
let isTokenizerReady = false; // Flag for tokenizer status
let isProcessing = false; // Flag to prevent concurrent processing

// --- DOM Elements ---
let fileInput;
let urlInput;
let fetchUrlButton;
let treeContainer;
let exportButton;
let statusElement;
let totalOriginalTokensElement;
let totalSelectedTokensElement;
let percentageRemovedElement;
let selectAllButton;
let selectNoneButton;
let duplicateListContainer;

// --- Tiktoken Initialization ---
async function initializeTiktoken() {
  console.log("Starting tiktoken initialization...");

  try {
    // Import tiktoken library dynamically
    const tiktoken = await import("tiktoken");
    console.log("Tiktoken library imported successfully", tiktoken);

    // Initialize cl100k_base encoder
    console.log("Creating tokenizer for cl100k_base encoding...");
    const getEncoding = tiktoken.getEncoding;

    try {
      const encoding = getEncoding("cl100k_base");
      console.log("Encoder created:", encoding);

      tiktokenEncoder = {
        encode: (text) => {
          const result = encoding.encode(text);
          return result;
        },
        decode: (tokens) => encoding.decode(tokens),
      };

      // Test the encoder
      const testText = "Hello, world!";
      const testTokens = tiktokenEncoder.encode(testText);
      console.log(
        `Test encoding '${testText}': ${testTokens.length} tokens:`,
        testTokens
      );

      console.log(
        "Tiktoken encoder initialized successfully with cl100k_base."
      );
      isTokenizerReady = true;
      return true;
    } catch (error) {
      console.error("Error creating specific encoding:", error);
      throw error;
    }
  } catch (error) {
    console.warn("Using fallback tokenizer due to error:", error.message);

    // Create a simple fallback tokenizer
    tiktokenEncoder = {
      encode: (text) => {
        if (!text) return [];
        // Simple approximation: split on whitespace and punctuation
        return text.match(/\S+|\s+|[.,!?;:"'()\[\]{}]/g) || [];
      },
      decode: (tokens) => tokens.join(""),
    };

    // Set ready to true but use fallback
    isTokenizerReady = true;
    return false; // Return false to indicate fallback is being used
  }
}

// --- Utility Functions ---

function updateStatus(message, type = "info") {
  console.log(`Status update (${type}): ${message}`);

  if (!statusElement) {
    console.warn("Status element not found in DOM");
    return;
  }

  statusElement.textContent = message;
  let color;
  switch (type) {
    case "error":
      color = "var(--accent-danger, red)";
      console.error(message);
      break;
    case "success":
      color = "var(--accent-success, green)";
      console.log(message);
      break;
    default:
      color = "var(--text-muted)";
      console.log(message);
      break;
  }
  statusElement.style.color = color;
}

function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return "0";
  return num.toLocaleString();
}

function countTokens(text = "") {
  if (!text) return 0;

  // Only use encoder if it's ready
  if (tiktokenEncoder && isTokenizerReady) {
    try {
      const tokens = tiktokenEncoder.encode(text);
      return tokens.length;
    } catch (error) {
      console.warn(
        `Tiktoken encoding error (falling back): "${text.substring(0, 30)}..."`,
        error
      );
      return approximateTokenCount(text);
    }
  }

  return approximateTokenCount(text);
}

function approximateTokenCount(text = "") {
  // Simple approximation: count words and add 1 token per ~4 characters for non-word tokens
  const words = text.match(/\S+/g) || [];
  const wordCount = words.length;
  const charCount = text.length;
  const approximateTokens = wordCount + Math.floor(charCount / 4) * 0.1;
  return Math.max(wordCount, Math.floor(approximateTokens));
}

function calculateExclusiveSectionTokens(section) {
  const headingLine = `${"#".repeat(section.level)} ${section.title}`;
  const contentNewlines =
    section.content.length > 0 ? section.content.length : 0; // Count line breaks
  const contentText = section.content.join("\n");

  // Ensure tokens are counted even if empty strings are involved
  const headingTokens = countTokens(headingLine);
  const contentTokens = countTokens(contentText);

  // Add 1 token per explicit line break seems reasonable if tiktoken doesn't count them distinctly enough
  return headingTokens + contentTokens + contentNewlines;
}

function calculateTotalSectionTokensRecursive(sectionId, sectionMap) {
  const section = sectionMap.get(sectionId);
  // Prevent infinite loops & redundant calculation
  if (!section || section.totalTokenCount > section.exclusiveTokenCount) {
    return section?.totalTokenCount ?? 0; // Return already calculated or 0 if non-existent
  }

  let total = section.exclusiveTokenCount || 0; // Start with self

  if (section.childrenIds && section.childrenIds.length > 0) {
    section.childrenIds.forEach((childId) => {
      total += calculateTotalSectionTokensRecursive(childId, sectionMap);
    });
  }

  section.totalTokenCount = total; // Store it
  return total;
}

// --- Core Logic: Parsing, Structure, Rendering ---

async function processLLMSContent(text) {
  console.log("processLLMSContent called with text length:", text?.length);

  if (!text) {
    console.error("No text provided to processLLMSContent");
    updateStatus("Error: No content to process", "error");
    return;
  }

  if (isProcessing) {
    updateStatus("Processing previous request, please wait...", "info");
    return;
  }
  isProcessing = true;
  updateStatus("Parsing content...");
  treeContainer.innerHTML =
    '<p class="italic text-[var(--text-muted)] text-sm">Parsing...</p>';
  duplicateListContainer.innerHTML =
    '<p class="italic text-[var(--text-muted)] text-sm">Parsing...</p>';
  parsedSections = [];
  sectionMap.clear();
  duplicateTitles = {};
  totalOriginalTokenCount = 0;
  disableButtons(true);

  await new Promise((resolve) => setTimeout(resolve, 10)); // Brief pause for UI

  try {
    console.log("Starting to parse LLMS content...");
    parsedSections = parseLLMS(text); // Includes token calculation
    console.log(`Parsed ${parsedSections.length} sections`);

    sectionMap = new Map(parsedSections.map((s) => [s.id, s]));
    console.log("Created section map");

    console.log("Rendering tree...");
    renderTree(parsedSections); // Renders nested DOM

    console.log("Updating token counts...");
    updateTokenCounts();

    console.log("Finding and rendering duplicates...");
    findAndRenderDuplicates(parsedSections);

    updateStatus(
      `Content processed: ${formatNumber(
        parsedSections.length
      )} sections found.`,
      "success"
    );
    disableButtons(false);
  } catch (error) {
    console.error("Processing error with stack:", error.stack);
    updateStatus(`Error processing content: ${error.message}`, "error");
    console.error("Processing error:", error);
    treeContainer.innerHTML =
      '<p class="italic text-[var(--text-muted)] text-sm">Error processing content.</p>';
    duplicateListContainer.innerHTML =
      '<p class="italic text-[var(--text-muted)] text-sm">Error processing content.</p>';
    disableButtons(true);
  } finally {
    isProcessing = false;
  }
}

function parseLLMS(text) {
  const lines = text.split("\n");
  const sections = [];
  let currentParentStack = [{ id: "root", level: 0, childrenIds: [] }];
  let sectionIdCounter = 0;
  const headingRegex = /^(#+)\s+(.*)/;
  let currentSectionData = null;

  const finalizeSection = () => {
    if (currentSectionData) {
      // Ensure content ends with a newline if not empty (might affect token count slightly)
      // if (currentSectionData.content.length > 0 && currentSectionData.content[currentSectionData.content.length - 1].trim() !== '') {
      //     currentSectionData.content.push('');
      // }
      currentSectionData.exclusiveTokenCount =
        calculateExclusiveSectionTokens(currentSectionData);
      sections.push(currentSectionData);
    }
    currentSectionData = null; // Reset for the next section
  };

  lines.forEach((line) => {
    const headingMatch = line.match(headingRegex);

    if (headingMatch) {
      finalizeSection(); // Finalize previous before starting new

      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();

      while (
        currentParentStack.length > 1 &&
        currentParentStack[currentParentStack.length - 1].level >= level
      ) {
        currentParentStack.pop();
      }
      const parent = currentParentStack[currentParentStack.length - 1];

      currentSectionData = {
        id: `section-${sectionIdCounter++}`,
        level: level,
        title: title,
        content: [],
        exclusiveTokenCount: 0,
        totalTokenCount: 0,
        element: null,
        checkbox: null,
        childrenIds: [],
        parentId: parent.id === "root" ? null : parent.id,
      };

      if (parent.id !== "root" && parent.childrenIds) {
        // Ensure parent.childrenIds exists
        parent.childrenIds.push(currentSectionData.id);
      } else if (parent.id !== "root") {
        // Initialize if somehow missing (defensive)
        parent.childrenIds = [currentSectionData.id];
      }
      currentParentStack.push(currentSectionData);
    } else {
      // Add content lines (including potentially empty ones between paragraphs)
      if (!currentSectionData) {
        // Content before first heading
        if (line.trim() !== "" || sections.length > 0) {
          // Only create preface if line has content OR we already have sections
          currentSectionData = {
            id: `section-${sectionIdCounter++}`,
            level: 0,
            title: "(Preface)",
            content: [],
            exclusiveTokenCount: 0,
            totalTokenCount: 0,
            element: null,
            checkbox: null,
            childrenIds: [],
            parentId: null,
          };
          currentParentStack.push(currentSectionData);
        } else {
          return; // Skip leading whitespace lines before any content/heading
        }
      }
      // Check if it's just whitespace, only add if content already exists or line isn't just whitespace
      if (line.trim() !== "" || currentSectionData.content.length > 0) {
        currentSectionData.content.push(line);
      }
    }
  });

  finalizeSection(); // Finalize the very last section

  // --- Post-processing: Token Counts and Hierarchy ---
  const tempSectionMap = new Map(sections.map((s) => [s.id, s]));
  totalOriginalTokenCount = 0;

  // Ensure all exclusive counts are calculated (finalizeSection handles most)
  sections.forEach((section) => {
    if (!section.exclusiveTokenCount) {
      // Recalculate if somehow missed (e.g., empty sections)
      section.exclusiveTokenCount = calculateExclusiveSectionTokens(section);
    }
    section.totalTokenCount = 0; // Reset total for recalculation
  });

  // Calculate total tokens recursively starting from root nodes
  sections.forEach((section) => {
    if (section.parentId === null) {
      calculateTotalSectionTokensRecursive(section.id, tempSectionMap);
      totalOriginalTokenCount += section.totalTokenCount;
    }
  });

  return sections;
}

function renderTree(sections) {
  treeContainer.innerHTML = "";
  if (!sections || sections.length === 0) {
    treeContainer.innerHTML =
      '<p class="italic text-[var(--text-muted)] text-sm">No sections found or loaded.</p>';
    return;
  }
  const fragment = document.createDocumentFragment();
  sections.forEach((section) => {
    if (section.parentId === null) {
      // Start rendering from root nodes
      fragment.appendChild(createTreeItemElement(section));
    }
  });
  treeContainer.appendChild(fragment);
  updateTokenCounts(); // Update summary after rendering
  // findAndRenderDuplicates is called by the initiator (processLLMSContent)
}

function createTreeItemElement(section) {
  // Create the main container for this tree item
  const itemDiv = document.createElement("div");
  itemDiv.classList.add("tree-item");
  itemDiv.dataset.level = section.level;
  itemDiv.dataset.id = section.id;
  itemDiv.dataset.collapsed = "false";
  section.element = itemDiv;

  // Create the content area (holds toggle, checkbox, and label)
  const itemContentDiv = document.createElement("div");
  itemContentDiv.classList.add("item-content");
  itemContentDiv.style.setProperty("--level", section.level);
  itemContentDiv.className =
    "item-content flex items-center py-1 relative min-h-[30px] rounded hover:bg-[var(--bg-tertiary)]";
  itemContentDiv.style.paddingLeft = `calc(${section.level} * 22px)`;

  // Add toggle icon (arrow) if this section has children
  const toggleIcon = document.createElement("span");
  toggleIcon.classList.add("toggle-icon");
  toggleIcon.className =
    "toggle-icon absolute top-1/2 -translate-y-1/2 cursor-pointer text-[var(--icon-color)] text-base select-none rounded z-[1] hover:bg-[var(--toggle-icon-hover-bg)]";
  toggleIcon.style.left = `calc(${section.level} * 22px - 20px)`;

  if (section.childrenIds && section.childrenIds.length > 0) {
    toggleIcon.setAttribute("role", "button");
    toggleIcon.setAttribute("aria-label", `Toggle ${section.title}`);
    toggleIcon.tabIndex = 0;
    itemDiv.dataset.hasChildren = "true";
  } else {
    toggleIcon.style.visibility = "hidden";
  }
  itemContentDiv.appendChild(toggleIcon);

  // Create checkbox for selection
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = true; // Start checked by default
  checkbox.id = `checkbox-${section.id}`;
  checkbox.dataset.id = section.id;
  checkbox.className =
    "mr-2 cursor-pointer scale-110 accent-[var(--accent-primary)] flex-shrink-0";
  section.checkbox = checkbox; // Store reference in section object
  itemContentDiv.appendChild(checkbox);

  // Create label containing title and token count
  const label = document.createElement("label");
  label.htmlFor = checkbox.id;
  label.className =
    "cursor-pointer flex-grow flex justify-between items-center";

  // Add section title
  const titleSpan = document.createElement("span");
  titleSpan.classList.add("section-title");
  titleSpan.className =
    "section-title mr-2 text-[var(--text-primary)] text-[0.95em] leading-[1.4]";
  titleSpan.textContent = section.title || `Section ${section.id}`;

  // Add specific styling based on heading level
  if (section.level === 1) {
    titleSpan.classList.add("font-semibold", "text-[1.05em]");
  } else if (section.level === 2) {
    titleSpan.classList.add("font-medium");
  } else if (section.level === 3) {
    titleSpan.classList.add("text-[var(--text-secondary)]");
  } else if (section.level >= 4) {
    titleSpan.classList.add("text-[var(--text-muted)]", "text-[0.9em]");
  }

  label.appendChild(titleSpan);

  // Add view section link
  const viewSectionLink = document.createElement("a");
  viewSectionLink.href = "#";
  viewSectionLink.classList.add("view-section-link");
  viewSectionLink.dataset.sectionId = section.id;
  viewSectionLink.className =
    "view-section-link text-xs text-[var(--accent-primary)] mr-4 hover:underline transition-colors duration-200 hover:text-[var(--accent-hover)]";
  viewSectionLink.textContent = "(view section)";
  viewSectionLink.setAttribute("role", "button");
  viewSectionLink.setAttribute("aria-expanded", "false");
  viewSectionLink.setAttribute(
    "aria-controls",
    `section-content-${section.id}`
  );
  viewSectionLink.onclick = (e) => {
    e.preventDefault();
    toggleSectionContent(section.id);
  };
  label.appendChild(viewSectionLink);

  // Add token count with tooltip
  const tokenSpan = document.createElement("span");
  tokenSpan.classList.add("token-count");
  tokenSpan.className =
    "token-count text-[0.8em] text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-1 py-0.5 rounded whitespace-nowrap ml-auto relative cursor-help";
  tokenSpan.textContent = `(~${formatNumber(section.totalTokenCount)} total)`;

  const tooltip = document.createElement("span");
  tooltip.classList.add("token-tooltip");
  tooltip.textContent = `Exclusive: ${formatNumber(
    section.exclusiveTokenCount
  )}`;
  tokenSpan.appendChild(tooltip);

  label.appendChild(tokenSpan);
  itemContentDiv.appendChild(label);

  // Add content to item
  itemDiv.appendChild(itemContentDiv);

  // Create section content container (initially hidden)
  const sectionContentContainer = document.createElement("div");
  sectionContentContainer.id = `section-content-${section.id}`;
  sectionContentContainer.classList.add("section-content-container");
  sectionContentContainer.className =
    "section-content-container hidden border-l-2 border-[var(--accent-primary)] ml-10 pl-4 py-2 mt-1 mb-2 bg-[var(--bg-secondary)] rounded text-sm text-[var(--text-primary)] whitespace-pre-wrap opacity-0 transform translate-y-2 transition-all duration-300 ease-in-out";

  // Add the formatted content
  if (section.content && section.content.length) {
    sectionContentContainer.textContent = section.content.join("\n");
  } else {
    sectionContentContainer.textContent = "(No content in this section)";
    sectionContentContainer.classList.add("text-[var(--text-muted)]", "italic");
  }

  itemDiv.appendChild(sectionContentContainer);

  // Create container for child sections
  const childrenContainer = document.createElement("div");
  childrenContainer.classList.add("item-children");
  itemDiv.appendChild(childrenContainer);

  // Recursively add child sections
  if (section.childrenIds && section.childrenIds.length > 0) {
    section.childrenIds.forEach((childId) => {
      const childSection = sectionMap.get(childId);
      if (childSection) {
        childrenContainer.appendChild(createTreeItemElement(childSection));
      }
    });
  }

  return itemDiv;
}

// Function to toggle section content visibility
function toggleSectionContent(sectionId) {
  const section = sectionMap.get(sectionId);
  if (!section) return;

  const viewLink = document.querySelector(
    `.view-section-link[data-section-id="${sectionId}"]`
  );
  const contentContainer = document.getElementById(
    `section-content-${sectionId}`
  );

  if (!viewLink || !contentContainer) return;

  const isExpanded = viewLink.getAttribute("aria-expanded") === "true";

  if (isExpanded) {
    // Hide content
    viewLink.textContent = "(view section)";
    viewLink.setAttribute("aria-expanded", "false");
    contentContainer.classList.add("hidden", "opacity-0", "translate-y-2");
    contentContainer.classList.remove("opacity-100", "translate-y-0");
  } else {
    // Show content
    viewLink.textContent = "(close section)";
    viewLink.setAttribute("aria-expanded", "true");
    contentContainer.classList.remove("hidden");

    // Trigger animation
    setTimeout(() => {
      contentContainer.classList.add("opacity-100", "translate-y-0");
      contentContainer.classList.remove("opacity-0", "translate-y-2");
    }, 10);
  }
}

function findAndRenderDuplicates(sections) {
  duplicateListContainer.innerHTML = "";
  duplicateTitles = {};
  const titleLevelMap = {};
  sections.forEach((section) => {
    const key = `${section.title}::${section.level}`;
    if (!titleLevelMap[key]) titleLevelMap[key] = [];
    titleLevelMap[key].push(section.id);
  });

  const fragment = document.createDocumentFragment();
  let foundDuplicates = false;

  Object.entries(titleLevelMap)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .forEach(([key, ids]) => {
      if (ids.length >= 3) {
        foundDuplicates = true;
        const [title, levelStr] = key.split("::");
        const level = parseInt(levelStr, 10);
        duplicateTitles[key] = { level: level, ids: ids, checkbox: null };

        const dupItemDiv = document.createElement("div");
        dupItemDiv.classList.add("duplicate-item");
        dupItemDiv.className =
          "duplicate-item flex items-center mb-1 p-1 rounded hover:bg-[var(--bg-tertiary)]";

        const masterCheckbox = document.createElement("input");
        masterCheckbox.type = "checkbox";
        masterCheckbox.checked = true;
        masterCheckbox.dataset.duplicateKey = key;
        masterCheckbox.id = `dup-checkbox-${key.replace(/[^a-zA-Z0-9]/g, "-")}`;
        masterCheckbox.className =
          "mr-2 scale-110 accent-[var(--accent-primary)] flex-shrink-0";
        duplicateTitles[key].checkbox = masterCheckbox; // Store ref

        const dupLabel = document.createElement("label");
        dupLabel.htmlFor = masterCheckbox.id;
        dupLabel.className =
          "text-[0.9em] text-[var(--text-secondary)] cursor-pointer flex-grow flex justify-between items-center";

        const titleSpan = document.createElement("span");
        titleSpan.classList.add("duplicate-title");
        titleSpan.className =
          "duplicate-title mr-1 text-[var(--text-primary)] break-words overflow-wrap-anywhere flex-1";
        titleSpan.textContent = title;
        dupLabel.appendChild(titleSpan);

        const countSpan = document.createElement("span");
        countSpan.classList.add("duplicate-count");
        countSpan.className =
          "duplicate-count text-[0.85em] text-[var(--text-muted)] whitespace-nowrap ml-2 flex-shrink-0";
        countSpan.textContent = `(L${level}, ${ids.length}x)`;
        dupLabel.appendChild(countSpan);

        dupItemDiv.appendChild(masterCheckbox);
        dupItemDiv.appendChild(dupLabel);
        fragment.appendChild(dupItemDiv);

        updateDuplicateMasterCheckboxState(key); // Set initial state
      }
    });

  if (foundDuplicates) {
    duplicateListContainer.appendChild(fragment);
  } else {
    duplicateListContainer.innerHTML =
      '<p class="italic text-[var(--text-muted)] text-sm">No significant duplicates found (min. 3 at same level).</p>';
  }
}

function updateTokenCounts() {
  let selectedCount = 0;
  parsedSections.forEach((section) => {
    if (section.checkbox && section.checkbox.checked) {
      selectedCount += section.exclusiveTokenCount;
    }
  });
  totalOriginalTokensElement.textContent = formatNumber(
    totalOriginalTokenCount
  );
  totalSelectedTokensElement.textContent = formatNumber(selectedCount);
  const percentageRemoved =
    totalOriginalTokenCount > 0
      ? (
          ((totalOriginalTokenCount - selectedCount) /
            totalOriginalTokenCount) *
          100
        ).toFixed(1)
      : 0;
  percentageRemovedElement.textContent = `${percentageRemoved}%`;
}

// --- Checkbox State Logic ---

function cascadeCheck(sectionId, isChecked, sectionMap) {
  console.log(
    `Cascading ${isChecked ? "check" : "uncheck"} from section ${sectionId}`
  );

  const section = sectionMap.get(sectionId);
  if (!section || !section.checkbox) {
    console.warn(
      `Cannot cascade check for section ${sectionId} - section or checkbox not found`
    );
    return;
  }

  // Update this section's checkbox
  section.checkbox.checked = isChecked;
  section.checkbox.indeterminate = false;

  // Recursively update all children
  if (section.childrenIds && section.childrenIds.length > 0) {
    console.log(
      `Cascading to ${section.childrenIds.length} children of ${sectionId}`
    );
    section.childrenIds.forEach((childId) => {
      cascadeCheck(childId, isChecked, sectionMap);
    });
  } else {
    console.log(`Section ${sectionId} has no children to cascade to`);
  }
}

function updateParentIndeterminateStates(sectionId, sectionMap) {
  console.log(`Updating parent states for section ${sectionId}`);

  const section = sectionMap.get(sectionId);
  if (!section || !section.parentId) {
    console.log(`Section ${sectionId} has no parent to update`);
    return;
  }

  let currentParentId = section.parentId;
  while (currentParentId) {
    const parentSection = sectionMap.get(currentParentId);
    if (!parentSection || !parentSection.checkbox) {
      console.warn(
        `Parent section ${currentParentId} or its checkbox not found`
      );
      break;
    }

    console.log(`Checking parent ${currentParentId} state...`);

    // Count child states
    let allChecked = true;
    let allUnchecked = true;
    let childCount = 0;

    if (parentSection.childrenIds && parentSection.childrenIds.length > 0) {
      parentSection.childrenIds.forEach((childId) => {
        const childSection = sectionMap.get(childId);
        if (childSection && childSection.checkbox) {
          childCount++;
          if (!childSection.checkbox.checked) {
            allChecked = false;
          }
          if (
            childSection.checkbox.checked ||
            childSection.checkbox.indeterminate
          ) {
            allUnchecked = false;
          }
        }
      });

      console.log(
        `Parent ${currentParentId} has ${childCount} children: allChecked=${allChecked}, allUnchecked=${allUnchecked}`
      );
    }

    // Determine parent state based on children
    if (childCount === 0) {
      // No children found, set to unchecked
      parentSection.checkbox.checked = false;
      parentSection.checkbox.indeterminate = false;
    } else if (allChecked) {
      // All children checked
      parentSection.checkbox.checked = true;
      parentSection.checkbox.indeterminate = false;
    } else if (allUnchecked) {
      // All children unchecked
      parentSection.checkbox.checked = false;
      parentSection.checkbox.indeterminate = false;
    } else {
      // Mixed state
      parentSection.checkbox.checked = false;
      parentSection.checkbox.indeterminate = true;
    }

    // Update duplicate master if this parent is part of a duplicate group
    const parentDupKey = `${parentSection.title}::${parentSection.level}`;
    if (duplicateTitles[parentDupKey]) {
      updateDuplicateMasterCheckboxState(parentDupKey);
    }

    // Move up to next parent
    currentParentId = parentSection.parentId;
  }
}

function updateDuplicateMasterCheckboxState(duplicateKey) {
  const duplicateInfo = duplicateTitles[duplicateKey];
  if (!duplicateInfo || !duplicateInfo.checkbox) return;
  let allChecked = true;
  let allUnchecked = true;
  let hasMixed = false;
  let instanceCount = 0;
  duplicateInfo.ids.forEach((instanceId) => {
    const instanceSection = sectionMap.get(instanceId); // Use map
    const instanceCheckbox = instanceSection?.checkbox;
    if (instanceCheckbox) {
      instanceCount++;
      if (!instanceCheckbox.checked && !instanceCheckbox.indeterminate)
        allChecked = false;
      if (instanceCheckbox.checked || instanceCheckbox.indeterminate)
        allUnchecked = false;
      if (instanceCheckbox.indeterminate) hasMixed = true;
    }
  });
  if (instanceCount === 0) {
    duplicateInfo.checkbox.checked = false;
    duplicateInfo.checkbox.indeterminate = false;
  } else if (allChecked && !hasMixed) {
    duplicateInfo.checkbox.checked = true;
    duplicateInfo.checkbox.indeterminate = false;
  } else if (allUnchecked && !hasMixed) {
    duplicateInfo.checkbox.checked = false;
    duplicateInfo.checkbox.indeterminate = false;
  } else {
    duplicateInfo.checkbox.checked = false; // Master isn't checked in mixed state
    duplicateInfo.checkbox.indeterminate = true;
  }
}

function toggleCollapse(sectionId) {
  const section = sectionMap.get(sectionId); // Use map
  if (
    !section ||
    !section.element ||
    !section.childrenIds ||
    section.childrenIds.length === 0
  )
    return;

  // Toggle class on the main item element
  const isCollapsing = section.element.classList.toggle("collapsed");
  section.element.dataset.collapsed = isCollapsing; // Sync data attribute
}

// --- Event Handlers ---

async function handleFileSelect(event) {
  console.log("handleFileSelect called");
  const file = event.target.files[0];
  if (urlInput) urlInput.value = "";

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
      console.log(`File loaded, content length: ${e.target.result.length}`);
      try {
        await processLLMSContent(e.target.result);
      } catch (processError) {
        console.error("Error processing file content:", processError);
        updateStatus(`Error processing file: ${processError.message}`, "error");
      }
    };

    reader.onerror = (e) => {
      console.error("FileReader error:", e);
      updateStatus("Error reading file.", "error");
      disableButtons(false);
      isProcessing = false;
    };

    reader.readAsText(file);
  } catch (error) {
    console.error("Error in file handling:", error);
    updateStatus(`Error handling file: ${error.message}`, "error");
    disableButtons(false);
    isProcessing = false;
  }
}

async function handleFetchUrl() {
  console.log("handleFetchUrl called");
  const url = urlInput.value.trim();
  if (fileInput) fileInput.value = "";

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

    await processLLMSContent(text); // Await processing
  } catch (error) {
    console.error("Fetch error with stack:", error.stack);
    updateStatus(`Error fetching from URL: ${error.message}.`, "error");

    if (treeContainer) {
      treeContainer.innerHTML =
        '<p class="italic text-[var(--text-muted)] text-sm">Error loading content from URL.</p>';
    }

    if (duplicateListContainer) {
      duplicateListContainer.innerHTML =
        '<p class="italic text-[var(--text-muted)] text-sm">Error loading duplicates.</p>';
    }

    console.error("Fetch error:", error);
    disableButtons(false);
    isProcessing = false; // Ensure flag is reset on error
  }
}

function handleExport() {
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
    `Exporting ${formatNumber(sectionsIncludedCount)} sections (~${formatNumber(
      finalTokenCount
    )} exclusive tokens)...`
  );
  const blob = new Blob([outputContent], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "llms_edited.txt";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
  updateStatus(
    `Export complete: llms_edited.txt (~${formatNumber(
      finalTokenCount
    )} exclusive tokens).`,
    "success"
  );
}

function handleTreeClick(event) {
  console.log("Tree click detected", event.target);

  if (isProcessing) {
    console.log("Processing in progress, ignoring click");
    return;
  }

  const target = event.target;
  const treeItem = target.closest(".tree-item");

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
  let checkbox = null;
  if (target.type === "checkbox" && target.dataset.id === sectionId) {
    console.log("Direct checkbox click detected");
    checkbox = target;
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
      if (duplicateTitles[dupKey]) {
        updateDuplicateMasterCheckboxState(dupKey);
      }
    }

    // Finally update token counts
    updateTokenCounts();
  });
}

function handleDuplicateListClick(event) {
  if (isProcessing) return;
  const target = event.target;
  let checkbox = null;
  let duplicateKey = null;

  if (target.type === "checkbox" && target.dataset.duplicateKey) {
    checkbox = target;
    duplicateKey = target.dataset.duplicateKey;
  } else {
    const label = target.closest("label");
    if (label && label.htmlFor.startsWith("dup-checkbox-")) {
      checkbox = document.getElementById(label.htmlFor);
      if (checkbox) {
        // Let browser handle the check toggle via label click
        duplicateKey = checkbox.dataset.duplicateKey;
      }
    }
  }

  if (checkbox && duplicateKey) {
    const isChecked = checkbox.checked; // State *after* click
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

function selectAllNone(select = true) {
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
  updateStatus(select ? "All sections selected." : "All sections deselected.");
}

function disableButtons(disabled) {
  if (exportButton) exportButton.disabled = disabled;
  if (selectAllButton) selectAllButton.disabled = disabled;
  if (selectNoneButton) selectNoneButton.disabled = disabled;
  if (fetchUrlButton) fetchUrlButton.disabled = disabled;
  if (fileInput) fileInput.disabled = disabled;

  if (treeContainer) {
    treeContainer.style.pointerEvents = disabled ? "none" : "auto";
    treeContainer.style.opacity = disabled ? "0.6" : "1";
  }

  if (duplicateListContainer) {
    duplicateListContainer.style.pointerEvents = disabled ? "none" : "auto";
    duplicateListContainer.style.opacity = disabled ? "0.6" : "1";
  }
}

// --- Initialization & Event Listeners ---

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded, starting initialization...");

  // Get DOM elements
  fileInput = document.getElementById("fileInput");
  urlInput = document.getElementById("urlInput");
  fetchUrlButton = document.getElementById("fetchUrlButton");
  treeContainer = document.getElementById("tree-container");
  exportButton = document.getElementById("export-button");
  statusElement = document.getElementById("status");
  totalOriginalTokensElement = document.getElementById("totalOriginalTokens");
  totalSelectedTokensElement = document.getElementById("totalSelectedTokens");
  percentageRemovedElement = document.getElementById("percentageRemoved");
  selectAllButton = document.getElementById("selectAllButton");
  selectNoneButton = document.getElementById("selectNoneButton");
  duplicateListContainer = document.getElementById("duplicate-list");

  // Log all important DOM elements to check if they're correctly found
  console.log("DOM Elements:", {
    fileInput,
    urlInput,
    fetchUrlButton,
    treeContainer,
    exportButton,
    statusElement,
    totalOriginalTokensElement,
    totalSelectedTokensElement,
    percentageRemovedElement,
    selectAllButton,
    selectNoneButton,
    duplicateListContainer,
  });

  updateStatus("Initializing tokenizer...");

  if (treeContainer) {
    treeContainer.innerHTML =
      '<p class="italic text-[var(--text-muted)] text-sm">Initializing Tokenizer...</p>';
  }

  if (duplicateListContainer) {
    duplicateListContainer.innerHTML =
      '<p class="italic text-[var(--text-muted)] text-sm">Load content to find duplicates.</p>';
  }

  disableButtons(true); // Start disabled

  // Attempt to initialize Tiktoken
  initializeTiktoken()
    .then(() => {
      console.log("Tiktoken initialization complete");
      updateStatus("Ready. Load an llms.txt file via URL or upload.");
    })
    .catch((error) => {
      // Error already logged in initializeTiktoken
      console.error("Tiktoken initialization failed:", error);
      // Continue with approximate counting - the error is handled in initializeTiktoken
      updateStatus("Ready. Using approximate token counts.", "info");
      isTokenizerReady = true; // Set to true so the app can still function
    })
    .finally(() => {
      console.log("Initialization complete, enabling UI");
      disableButtons(false); // Enable UI regardless of tokenizer success
      // Ensure placeholder is correct if tree is still empty
      if (parsedSections.length === 0 && treeContainer) {
        treeContainer.innerHTML =
          '<p class="italic text-[var(--text-muted)] text-sm">Load a file or URL to see sections.</p>';
      }
    });

  // Add Event Listeners with logging
  if (fileInput) {
    fileInput.addEventListener(
      "change",
      (event) => {
        console.log("File input change event fired", event);
        handleFileSelect(event);
      },
      false
    );
  }

  if (fetchUrlButton) {
    fetchUrlButton.addEventListener(
      "click",
      () => {
        console.log("Fetch URL button clicked");
        handleFetchUrl();
      },
      false
    );
  }

  if (exportButton) {
    exportButton.addEventListener(
      "click",
      () => {
        console.log("Export button clicked");
        handleExport();
      },
      false
    );
  }

  if (treeContainer) {
    treeContainer.addEventListener("click", (event) => {
      console.log("Tree container clicked", event.target);
      handleTreeClick(event);
    });
  }

  if (selectAllButton) {
    selectAllButton.addEventListener("click", () => {
      console.log("Select all button clicked");
      selectAllNone(true);
    });
  }

  if (selectNoneButton) {
    selectNoneButton.addEventListener("click", () => {
      console.log("Select none button clicked");
      selectAllNone(false);
    });
  }

  if (duplicateListContainer) {
    duplicateListContainer.addEventListener("click", (event) => {
      console.log("Duplicate list container clicked", event.target);
      handleDuplicateListClick(event);
    });
  }

  console.log("All event listeners attached");
});
