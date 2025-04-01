import { editorStore } from "./store";
import type { Section, StatusType } from "./types";

/**
 * Format a number with thousand separators
 */
export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) return "0";
  return num.toLocaleString();
}

/**
 * Update the status message
 */
export function updateStatus(message: string, type: StatusType = "info"): void {
  const statusElement = document.getElementById("status");
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

/**
 * Update the token count display
 */
export function updateTokenCounts(): void {
  const state = editorStore.getState();
  const { parsedSections, totalOriginalTokenCount } = state;

  let selectedCount = 0;
  parsedSections.forEach((section) => {
    if (section.checkbox && section.checkbox.checked) {
      selectedCount += section.exclusiveTokenCount;
    }
  });

  const totalOriginalTokensElement = document.getElementById(
    "totalOriginalTokens"
  );
  const totalSelectedTokensElement = document.getElementById(
    "totalSelectedTokens"
  );
  const percentageRemovedElement = document.getElementById("percentageRemoved");

  if (totalOriginalTokensElement) {
    totalOriginalTokensElement.textContent = formatNumber(
      totalOriginalTokenCount
    );
  }

  if (totalSelectedTokensElement) {
    totalSelectedTokensElement.textContent = formatNumber(selectedCount);
  }

  if (percentageRemovedElement) {
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
}

/**
 * Enable or disable UI buttons
 */
export function disableButtons(disabled: boolean): void {
  const elementIds = [
    "exportButton",
    "selectAllButton",
    "selectNoneButton",
    "fetchUrlButton",
    "fileInput",
  ];

  elementIds.forEach((id) => {
    const element = document.getElementById(id);
    if (element && "disabled" in element) {
      (element as HTMLButtonElement | HTMLInputElement).disabled = disabled;
    }
  });

  const treeContainer = document.getElementById("tree-container");
  const duplicateListContainer = document.getElementById("duplicate-list");

  if (treeContainer) {
    treeContainer.style.pointerEvents = disabled ? "none" : "auto";
    treeContainer.style.opacity = disabled ? "0.6" : "1";
  }

  if (duplicateListContainer) {
    duplicateListContainer.style.pointerEvents = disabled ? "none" : "auto";
    duplicateListContainer.style.opacity = disabled ? "0.6" : "1";
  }
}

/**
 * Cascade checkbox state to all children
 */
export function cascadeCheck(
  sectionId: string,
  isChecked: boolean,
  sectionMap: Map<string, Section>
): void {
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
    section.childrenIds.forEach((childId) => {
      cascadeCheck(childId, isChecked, sectionMap);
    });
  }
}

/**
 * Update parent indeterminate states based on children
 */
export function updateParentIndeterminateStates(
  sectionId: string,
  sectionMap: Map<string, Section>
): void {
  const section = sectionMap.get(sectionId);
  if (!section || !section.parentId) {
    return;
  }

  let currentParentId: string | null = section.parentId;
  while (currentParentId) {
    const parentSection = sectionMap.get(currentParentId);
    if (!parentSection || !parentSection.checkbox) {
      break;
    }

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
    const duplicateTitles = editorStore.getState().duplicateTitles;
    if (duplicateTitles[parentDupKey]) {
      updateDuplicateMasterCheckboxState(parentDupKey);
    }

    // Move up to next parent
    currentParentId = parentSection.parentId;
  }
}

/**
 * Update the master checkbox state for duplicate title groups
 */
export function updateDuplicateMasterCheckboxState(duplicateKey: string): void {
  const { duplicateTitles, sectionMap } = editorStore.getState();
  const duplicateInfo = duplicateTitles[duplicateKey];

  if (!duplicateInfo || !duplicateInfo.checkbox) return;

  let allChecked = true;
  let allUnchecked = true;
  let hasMixed = false;
  let instanceCount = 0;

  duplicateInfo.ids.forEach((instanceId) => {
    const instanceSection = sectionMap.get(instanceId);
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

/**
 * Toggle section collapse state
 */
export function toggleCollapse(sectionId: string): void {
  const { sectionMap } = editorStore.getState();
  const section = sectionMap.get(sectionId);

  if (
    !section ||
    !section.element ||
    !section.childrenIds ||
    section.childrenIds.length === 0
  ) {
    return;
  }

  // Toggle class on the main item element
  const isCollapsing = section.element.classList.toggle("collapsed");
  section.element.dataset.collapsed = isCollapsing.toString();
}

/**
 * Toggle section content visibility
 */
export function toggleSectionContent(sectionId: string): void {
  const state = editorStore.getState();
  const section = state.sectionMap.get(sectionId);
  if (!section) return;

  const viewLink = document.querySelector(
    `.view-section-link[data-section-id="${sectionId}"]`
  ) as HTMLElement | null;

  const contentContainer = document.getElementById(
    `section-content-${sectionId}`
  );

  if (!viewLink || !contentContainer) return;

  const isExpanded = viewLink.getAttribute("aria-expanded") === "true";

  if (isExpanded) {
    // Hide content
    viewLink.textContent = "(view section)";
    viewLink.setAttribute("aria-expanded", "false");
    contentContainer!.classList.add("hidden", "opacity-0", "translate-y-2");
    contentContainer!.classList.remove("opacity-100", "translate-y-0");
  } else {
    // Show content
    viewLink.textContent = "(close section)";
    viewLink.setAttribute("aria-expanded", "true");
    contentContainer!.classList.remove("hidden");

    // Trigger animation
    setTimeout(() => {
      if (contentContainer) {
        contentContainer.classList.add("opacity-100", "translate-y-0");
        contentContainer.classList.remove("opacity-0", "translate-y-2");
      }
    }, 10);
  }
}
