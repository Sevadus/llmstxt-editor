import { editorStore } from "./store";
import type { DuplicateTitlesMap, Section } from "./types";
import {
  formatNumber,
  toggleSectionContent,
  updateDuplicateMasterCheckboxState,
  updateTokenCounts,
} from "./ui-utils";

/**
 * Create a tree item element for a section
 */
export function createTreeItemElement(section: Section): HTMLElement {
  // Create the main container for this tree item
  const itemDiv = document.createElement("div");
  itemDiv.classList.add("tree-item");
  itemDiv.dataset.level = section.level.toString();
  itemDiv.dataset.id = section.id;
  itemDiv.dataset.collapsed = "false";
  section.element = itemDiv;

  // Create the content area (holds toggle, checkbox, and label)
  const itemContentDiv = document.createElement("div");
  itemContentDiv.classList.add("item-content");
  itemContentDiv.style.setProperty("--level", section.level.toString());
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
      const { sectionMap } = editorStore.getState();
      const childSection = sectionMap.get(childId);
      if (childSection) {
        childrenContainer.appendChild(createTreeItemElement(childSection));
      }
    });
  }

  return itemDiv;
}

/**
 * Render the tree of sections
 */
export function renderTree(sections: Section[]): void {
  const treeContainer = document.getElementById("tree-container");
  if (!treeContainer) {
    console.error("Tree container not found in DOM");
    return;
  }

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
}

/**
 * Find and render duplicate sections
 */
export function findAndRenderDuplicates(
  sections: Section[]
): DuplicateTitlesMap {
  const duplicateListContainer = document.getElementById("duplicate-list");
  if (!duplicateListContainer) {
    console.error("Duplicate list container not found in DOM");
    return {};
  }

  duplicateListContainer.innerHTML = "";
  const duplicateTitles: DuplicateTitlesMap = {};
  const titleLevelMap: Record<string, string[]> = {};

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

  return duplicateTitles;
}
