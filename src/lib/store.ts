import type { DuplicateTitlesMap, EditorStore, Section } from "./types";

/**
 * Create the initial editor store
 */
export function createEditorStore() {
  const initialState: EditorStore = {
    parsedSections: [],
    sectionMap: new Map<string, Section>(),
    duplicateTitles: {},
    totalOriginalTokenCount: 0,
    isTokenizerReady: false,
    isProcessing: false,
  };

  // Current state
  let state: EditorStore = { ...initialState };

  // Subscribers
  const subscribers: Array<(state: EditorStore) => void> = [];

  // Helper to notify all subscribers
  const notify = () => {
    subscribers.forEach((subscriber) => subscriber(state));
  };

  // Store operations
  function setSections(sections: Section[], totalTokenCount: number) {
    const sectionMap = new Map<string, Section>(
      sections.map((section) => [section.id, section])
    );

    state = {
      ...state,
      parsedSections: sections,
      sectionMap,
      totalOriginalTokenCount: totalTokenCount,
    };

    notify();
    return { sections, sectionMap };
  }

  function setDuplicateTitles(duplicates: DuplicateTitlesMap) {
    state = {
      ...state,
      duplicateTitles: duplicates,
    };
    notify();
  }

  function setProcessingState(isProcessing: boolean) {
    state = {
      ...state,
      isProcessing,
    };
    notify();
  }

  function setTokenizerReady(isReady: boolean) {
    state = {
      ...state,
      isTokenizerReady: isReady,
    };
    notify();
  }

  function resetStore() {
    state = { ...initialState };
    notify();
  }

  function updateSectionCheckbox(sectionId: string, isChecked: boolean) {
    const section = state.sectionMap.get(sectionId);
    if (section && section.checkbox) {
      section.checkbox.checked = isChecked;
      section.checkbox.indeterminate = false;
    }
    notify();
  }

  function getState(): EditorStore {
    return state;
  }

  // Return the store and its operations
  return {
    subscribe: (callback: (state: EditorStore) => void) => {
      subscribers.push(callback);
      callback(state); // Initial call

      // Return unsubscribe function
      return () => {
        const index = subscribers.indexOf(callback);
        if (index !== -1) {
          subscribers.splice(index, 1);
        }
      };
    },
    getState,
    setSections,
    setDuplicateTitles,
    setProcessingState,
    setTokenizerReady,
    resetStore,
    updateSectionCheckbox,
  };
}

// Create a singleton store instance
export const editorStore = createEditorStore();
