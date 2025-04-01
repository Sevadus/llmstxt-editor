/**
 * Represents a section in the LLMS.txt file
 */
export interface Section {
  id: string;
  level: number;
  title: string;
  content: string[];
  exclusiveTokenCount: number;
  totalTokenCount: number;
  parentId: string | null;
  childrenIds: string[];
  element: HTMLElement | null;
  checkbox: HTMLInputElement | null;
}

/**
 * Duplicate section title information
 */
export interface DuplicateInfo {
  level: number;
  ids: string[];
  checkbox: HTMLInputElement | null;
}

/**
 * Map of duplicate titles to their info
 */
export interface DuplicateTitlesMap {
  [key: string]: DuplicateInfo;
}

/**
 * Status type for UI updates
 */
export type StatusType = "info" | "error" | "success";

/**
 * Store for all LLMS content data
 */
export interface EditorStore {
  parsedSections: Section[];
  sectionMap: Map<string, Section>;
  duplicateTitles: DuplicateTitlesMap;
  totalOriginalTokenCount: number;
  isTokenizerReady: boolean;
  isProcessing: boolean;
}
