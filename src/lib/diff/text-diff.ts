import { diffWords, type Change } from "diff";

export interface TextDiffResult {
  changes: Change[];
  hasChanges: boolean;
  addedWordCount: number;
  removedWordCount: number;
}

export function computeTextDiff(previousText: string, newText: string): TextDiffResult {
  const changes = diffWords(previousText, newText);
  let addedWordCount = 0;
  let removedWordCount = 0;

  for (const change of changes) {
    const wordCount = change.value.trim().split(/\s+/).filter(Boolean).length;
    if (change.added) addedWordCount += wordCount;
    if (change.removed) removedWordCount += wordCount;
  }

  return {
    changes,
    hasChanges: addedWordCount > 0 || removedWordCount > 0,
    addedWordCount,
    removedWordCount,
  };
}
