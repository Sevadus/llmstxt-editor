import type { Tokenizer } from "./tokenizer";
import type { Section } from "./types";

/**
 * Calculate token count exclusively for a single section
 * @param section The section to calculate tokens for
 * @param tokenizer The tokenizer to use
 */
export function calculateExclusiveSectionTokens(
  section: Section,
  tokenizer: Tokenizer
): number {
  const headingLine = `${"#".repeat(section.level)} ${section.title}`;
  const contentNewlines =
    section.content.length > 0 ? section.content.length : 0; // Count line breaks
  const contentText = section.content.join("\n");

  // Ensure tokens are counted even if empty strings are involved
  const headingTokens = tokenizer.countTokens(headingLine);
  const contentTokens = tokenizer.countTokens(contentText);

  // Add 1 token per explicit line break
  return headingTokens + contentTokens + contentNewlines;
}

/**
 * Calculate total tokens recursively for a section and all its children
 * @param sectionId ID of the section to calculate
 * @param sectionMap Map of all sections
 */
export function calculateTotalSectionTokensRecursive(
  sectionId: string,
  sectionMap: Map<string, Section>
): number {
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

/**
 * Parse LLMS.txt content into structured sections
 * @param text The raw LLMS content
 * @param tokenizer The tokenizer to use
 */
export function parseLLMS(
  text: string,
  tokenizer: Tokenizer
): {
  sections: Section[];
  totalTokenCount: number;
} {
  if (!text) {
    return { sections: [], totalTokenCount: 0 };
  }

  const lines = text.split("\n");
  const sections: Section[] = [];
  let currentParentStack: Array<{
    id: string;
    level: number;
    childrenIds: string[];
  }> = [{ id: "root", level: 0, childrenIds: [] }];
  let sectionIdCounter = 0;
  const headingRegex = /^(#+)\s+(.*)/;
  let currentSectionData: Section | null = null;

  const finalizeSection = () => {
    if (currentSectionData) {
      // Calculate token count for this section
      currentSectionData.exclusiveTokenCount = calculateExclusiveSectionTokens(
        currentSectionData,
        tokenizer
      );
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

      // Pop the parent stack until we find a parent with a lower level
      while (
        currentParentStack.length > 1 &&
        currentParentStack[currentParentStack.length - 1].level >= level
      ) {
        currentParentStack.pop();
      }
      const parent = currentParentStack[currentParentStack.length - 1];

      // Create the new section
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

      // Add this section as a child of its parent
      if (parent.id !== "root" && parent.childrenIds) {
        parent.childrenIds.push(currentSectionData.id);
      }

      // Add this section to the parent stack
      currentParentStack.push({
        id: currentSectionData.id,
        level: currentSectionData.level,
        childrenIds: currentSectionData.childrenIds,
      });
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
          currentParentStack.push({
            id: currentSectionData.id,
            level: currentSectionData.level,
            childrenIds: currentSectionData.childrenIds,
          });
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
  let totalTokenCount = 0;

  // Ensure all exclusive counts are calculated (finalizeSection handles most)
  sections.forEach((section) => {
    if (!section.exclusiveTokenCount) {
      // Recalculate if somehow missed (e.g., empty sections)
      section.exclusiveTokenCount = calculateExclusiveSectionTokens(
        section,
        tokenizer
      );
    }
    section.totalTokenCount = 0; // Reset total for recalculation
  });

  // Calculate total tokens recursively starting from root nodes
  sections.forEach((section) => {
    if (section.parentId === null) {
      calculateTotalSectionTokensRecursive(section.id, tempSectionMap);
      totalTokenCount += section.totalTokenCount;
    }
  });

  return {
    sections,
    totalTokenCount,
  };
}
