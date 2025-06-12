import * as vscode from 'vscode';

/**
 * Defines the arguments for the main file creation command.
 */
export interface CreateFileArgs {
    /** If true, the file is created immediately without showing a dialog. */
    noDialog?: boolean;
    /** A specific name for the new file. Implies `noDialog: true`. */
    filename?: string;
    /** Initial content for the new file. */
    content?: string;
    /**
     * Overrides the default directory for this specific call.
     ** `string`: A specific path.
     ** `null`: The system's temporary directory.
     ** `undefined`: Uses the value from settings.
     */
    directory?: string | null;
    /**
     * Overrides the default extension for this specific call.
     */
    extension?: string;
    /**
     * If true, suppresses all non-error notifications.
     */
    quiet?: boolean;
}

/**
 * Represents an entry in the recent files history.
 */
export interface HistoryEntry {
    /** The displayed name of the file (e.g., 'file.txt'). */
    label: string;
    /** The full, absolute path to the file. */
    filePath: string;
    /** The timestamp of the last access, in milliseconds. */
    lastAccessed: number;
}

/**
 * Represents an item in the QuickPick list, extended with custom data.
 */
export interface QuickPickHistoryItem extends vscode.QuickPickItem {
    filePath: string;
    wasDeleted?: boolean;
    id?: string;
    buttons?: vscode.QuickInputButton[];
    alwaysShow?: boolean;
}
