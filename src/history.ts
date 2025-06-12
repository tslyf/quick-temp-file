import * as vscode from 'vscode';
import * as path from 'path';
import { HistoryEntry } from './types';
import { pathEqual } from './utils';

const HISTORY_KEY = 'quickTempFile.history';
const MAX_HISTORY_ITEMS = 20;

/**
 * Retrieves the raw history array from global state.
 * @param context The extension context.
 * @returns An array of history entries.
 */
export function getRawHistory(context: vscode.ExtensionContext): HistoryEntry[] {
    return context.globalState.get<HistoryEntry[]>(HISTORY_KEY, []);
}

/**
 * Updates the history with a new or existing file path, moving it to the top.
 * @param context The extension context.
 * @param filePath The path of the file to add or update in the history.
 */
export async function updateHistory(context: vscode.ExtensionContext, filePath: string): Promise<void> {
    let currentHistory = getRawHistory(context);
    const fileName = path.basename(filePath);
    
    const entryIndex = currentHistory.findIndex(e => pathEqual(e.filePath, filePath));
    if (entryIndex > -1) {
        currentHistory.splice(entryIndex, 1);
    }

    currentHistory.unshift({ label: fileName, filePath: filePath, lastAccessed: Date.now() });
    
    if (currentHistory.length > MAX_HISTORY_ITEMS) {
        currentHistory.length = MAX_HISTORY_ITEMS;
    }

    await context.globalState.update(HISTORY_KEY, currentHistory);
}

/**
 * Removes a specific file path from the history.
 * @param context The extension context.
 * @param filePathToRemove The path of the file to remove.
 */
export async function removeFromHistory(context: vscode.ExtensionContext, filePathToRemove: string): Promise<void> {
    let currentHistory = getRawHistory(context);
    currentHistory = currentHistory.filter(entry => !pathEqual(entry.filePath, filePathToRemove));
    await context.globalState.update(HISTORY_KEY, currentHistory);
}