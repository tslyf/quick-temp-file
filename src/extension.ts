import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

function normalizePath(pathToNormalize: string): string {
    const replace: [RegExp, string][] = [
        [/\\/g, '/'],
        [/(\w):/, '/$1'],
        [/(\w+)\/\.\.\/?/g, ''],
        [/^\.\//, ''],
        [/\/\.\//, '/'],
        [/\/\.$/, ''],
        [/\/$/, ''],
    ];

    let currentPath = pathToNormalize;
    replace.forEach(array => {
        while (array[0].test(currentPath)) {
            currentPath = currentPath.replace(array[0], array[1]);
        }
    });
    return currentPath;
}

function pathEqual(actual: string, expected: string): boolean {
    if (actual === expected) {
        return true;
    }
    let normalizedActual = normalizePath(actual);
    let normalizedExpected = normalizePath(expected);

    if (process.platform === "win32") {
        return normalizedActual.toLowerCase() === normalizedExpected.toLowerCase();
    } else {
        return normalizedActual === normalizedExpected;
    }
}

const HISTORY_KEY = 'quickTempFile.history';
const MAX_HISTORY_ITEMS = 20;
const ACTION_ID_CREATE_RANDOM_DEFAULT_EXT = '##ACTION_CREATE_RANDOM_DEFAULT_EXT##';
const ACTION_ID_CREATE_TYPED_NEW = '##ACTION_CREATE_TYPED_NEW##';
const ACTION_ID_CREATE_RANDOM_WITH_SPECIFIED_EXT = '##ACTION_CREATE_RANDOM_WITH_SPECIFIED_EXT##';


interface HistoryEntry {
    label: string;
    filePath: string;
    lastAccessed: number;
}

interface QuickPickHistoryItem extends vscode.QuickPickItem {
    filePath: string;
    wasDeleted?: boolean;
    id?: string;
    buttons?: vscode.QuickInputButton[];
}

const createdThisSessionTempFiles: Set<string> = new Set();

async function updateHistory(context: vscode.ExtensionContext, filePath: string): Promise<HistoryEntry[]> {
    let currentHistory = context.globalState.get<HistoryEntry[]>(HISTORY_KEY, []);
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
    return currentHistory;
}

function getRawHistory(context: vscode.ExtensionContext): HistoryEntry[] {
    return context.globalState.get<HistoryEntry[]>(HISTORY_KEY, []);
}

async function removeFromHistory(context: vscode.ExtensionContext, filePathToRemove: string): Promise<HistoryEntry[]> {
    let currentHistory = getRawHistory(context);
    currentHistory = currentHistory.filter(entry => entry.filePath !== filePathToRemove);
    await context.globalState.update(HISTORY_KEY, currentHistory);
    return currentHistory;
}


export function activate(context: vscode.ExtensionContext) {
    console.log(vscode.l10n.t('Quick Temp File is now active!'));

    async function prepareHistoryItems(currentHistory: HistoryEntry[]): Promise<QuickPickHistoryItem[]> {
        const items: QuickPickHistoryItem[] = [];
        const removeButtonTooltip = vscode.l10n.t('Remove from history');
        const deleteFileButtonTooltip = vscode.l10n.t('Delete file from disk');

        const removeButton: vscode.QuickInputButton = {
            iconPath: new vscode.ThemeIcon('close'),
            tooltip: removeButtonTooltip
        };
        const deleteFileButton: vscode.QuickInputButton = {
            iconPath: new vscode.ThemeIcon('trash'),
            tooltip: deleteFileButtonTooltip
        };

        for (const entry of currentHistory) {
            let fileExists = false;
            try {
                await fs.access(entry.filePath);
                fileExists = true;
            } catch {
                fileExists = false;
            }

            const directoryPath = path.dirname(entry.filePath);
            const historyItemButtons = [];
            if (fileExists) {
                historyItemButtons.push(deleteFileButton);
            }
            historyItemButtons.push(removeButton);

            if (fileExists) {
                items.push({
                    label: entry.label,
                    description: directoryPath,
                    filePath: entry.filePath,
                    wasDeleted: false,
                    buttons: historyItemButtons
                });
            } else {
                items.push({
                    label: entry.label, 
                    description: directoryPath + ' ' + vscode.l10n.t('(File deleted)'),
                    filePath: entry.filePath,
                    wasDeleted: true,
                    iconPath: new vscode.ThemeIcon('warning'),
                    buttons: [removeButton]
                });
            }
        }
        return items;
    }

    let disposable = vscode.commands.registerCommand('quickTempFile.create', async () => {
        const configuration = vscode.workspace.getConfiguration('quickTempFile');
        
        let pathForFilesSetting = configuration.get<string>('defaultPath');
        if (!pathForFilesSetting || pathForFilesSetting.trim() === "") {
            pathForFilesSetting = os.tmpdir();
        }
        const finalDefaultPath = pathForFilesSetting; 

        try {
            await fs.mkdir(finalDefaultPath, { recursive: true });
        } catch (mkdirError: any) {
            const typedError = mkdirError as { message?: string };
            vscode.window.showErrorMessage(vscode.l10n.t('Failed to create or access default path: {0}. Error: {1}', finalDefaultPath, typedError.message || String(mkdirError)));
            return;
        }

        const defaultExtensionSetting = configuration.get<string>('defaultExtension') || '.txt';
        
        async function showQuickPick() {
            const quickPick = vscode.window.createQuickPick<QuickPickHistoryItem>();
            quickPick.placeholder = vscode.l10n.t('Enter new filename (in {0}) or select recent', finalDefaultPath);
            quickPick.matchOnDescription = true;
            quickPick.matchOnDetail = true;
            quickPick.ignoreFocusOut = true;

            let currentRawHistory = getRawHistory(context);
            let currentBaseHistoryItems = await prepareHistoryItems(currentRawHistory);

            const updateQuickPickDisplayAndActiveState = (inputValue: string) => {
                const newItems: QuickPickHistoryItem[] = [];
                const trimmedValue = inputValue.trim();
                let activeItemForFocus: QuickPickHistoryItem | undefined;

                if (!trimmedValue) {
                    const randomItemDefaultExt: QuickPickHistoryItem = {
                        label: vscode.l10n.t('New file with random name'),
                        description: vscode.l10n.t('Extension: {0}', defaultExtensionSetting),
                        id: ACTION_ID_CREATE_RANDOM_DEFAULT_EXT,
                        filePath: ACTION_ID_CREATE_RANDOM_DEFAULT_EXT, 
                        iconPath: new vscode.ThemeIcon('zap'),
                        alwaysShow: true
                    };
                    newItems.push(randomItemDefaultExt);
                    activeItemForFocus = randomItemDefaultExt;
                } else {
                    if (trimmedValue.startsWith('.') && trimmedValue.length > 1) {
                        const specifiedExtension = trimmedValue;
                        const randomWithExtItem: QuickPickHistoryItem = {
                            label: vscode.l10n.t('New random file with extension: {0}', specifiedExtension),
                            id: ACTION_ID_CREATE_RANDOM_WITH_SPECIFIED_EXT,
                            filePath: specifiedExtension,
                            iconPath: new vscode.ThemeIcon('symbol-file'),
                            alwaysShow: true
                        };
                        newItems.push(randomWithExtItem);
                        activeItemForFocus = randomWithExtItem;
                    } else {
                        const hasExtension = path.extname(trimmedValue);
                        const filenameToCreate = hasExtension ? trimmedValue : `${trimmedValue}${defaultExtensionSetting}`;
                        const typedItem: QuickPickHistoryItem = {
                            label: vscode.l10n.t('Create file: {0}', filenameToCreate),
                            id: ACTION_ID_CREATE_TYPED_NEW,
                            filePath: filenameToCreate, 
                            iconPath: new vscode.ThemeIcon('new-file'),
                            alwaysShow: true
                        };
                        newItems.push(typedItem);
                        activeItemForFocus = typedItem;
                    }
                }
                
                newItems.push(...currentBaseHistoryItems);
                quickPick.items = newItems;
                
                if (activeItemForFocus) {
                    quickPick.activeItems = [activeItemForFocus];
                }
            };

            updateQuickPickDisplayAndActiveState(quickPick.value);
            quickPick.onDidChangeValue(updateQuickPickDisplayAndActiveState);

            quickPick.onDidTriggerItemButton(async (e: vscode.QuickPickItemButtonEvent<QuickPickHistoryItem>) => {
                const item = e.item;
                const removeFromHistoryTooltipText = vscode.l10n.t('Remove from history');
                const deleteFileTooltipText = vscode.l10n.t('Delete file from disk');
                const deleteActionText = vscode.l10n.t('Delete');

                if (e.button.tooltip === removeFromHistoryTooltipText) {
                    await removeFromHistory(context, item.filePath);
                    vscode.window.showInformationMessage(vscode.l10n.t('\"{0}\" removed from history.', item.label));
                    currentRawHistory = getRawHistory(context);
                    currentBaseHistoryItems = await prepareHistoryItems(currentRawHistory);
                    updateQuickPickDisplayAndActiveState(quickPick.value); 
                } else if (e.button.tooltip === deleteFileTooltipText) {
                    const confirmDelete = await vscode.window.showWarningMessage(
                        vscode.l10n.t('Are you sure you want to permanently delete the file \"{0}\"?', item.label),
                        { modal: true },
                        deleteActionText
                    );
                    if (confirmDelete === deleteActionText) {
                        try {
                            await fs.unlink(item.filePath);
                            vscode.window.showInformationMessage(vscode.l10n.t('File \"{0}\" deleted from disk.', item.label));
                            await removeFromHistory(context, item.filePath);
                            currentRawHistory = getRawHistory(context);
                            currentBaseHistoryItems = await prepareHistoryItems(currentRawHistory);
                            updateQuickPickDisplayAndActiveState(quickPick.value);
                        } catch (error: any) {
                            const typedError = error as { message?: string };
                            vscode.window.showErrorMessage(vscode.l10n.t('Failed to delete file \"{0}\" from disk. Error: {1}', item.label, typedError.message || String(error)));
                            currentRawHistory = getRawHistory(context);
                            currentBaseHistoryItems = await prepareHistoryItems(currentRawHistory);
                            updateQuickPickDisplayAndActiveState(quickPick.value);
                        }
                    } else {
                        updateQuickPickDisplayAndActiveState(quickPick.value);
                    }
                }
            });

            quickPick.onDidAccept(async () => {
                const selectedItems = quickPick.selectedItems;
                quickPick.hide();

                if (!selectedItems || selectedItems.length === 0) {
                    const currentVal = quickPick.value.trim();
                    if (currentVal && !(currentVal.startsWith('.') && currentVal.length > 1)) { 
                        const hasExtension = path.extname(currentVal);
                        const filePathForTyped = path.join(finalDefaultPath, hasExtension ? currentVal : `${currentVal}${defaultExtensionSetting}`);
                        await processFileOperation(filePathForTyped, 'createNew', context);
                    } else if (currentVal.startsWith('.') && currentVal.length > 1) {
                        const specifiedExtension = currentVal;
                        const randomName = `${uuidv4()}${specifiedExtension}`;
                        const filePathToUse = path.join(finalDefaultPath, randomName);
                        await processFileOperation(filePathToUse, 'createRandomWithSpecifiedExt', context);
                    }
                    else { 
                        vscode.window.showInformationMessage(vscode.l10n.t('Operation cancelled or no input provided.'));
                    }
                    quickPick.dispose();
                    return;
                }

                const selectedItem = selectedItems[0];
                let filePathToUse: string | undefined;
                let operationType: 'openExisting' | 'createNew' | 'recreateDeleted' | 'createRandomWithDefaultExt' | 'createRandomWithSpecifiedExt';

                if (selectedItem.id === ACTION_ID_CREATE_RANDOM_DEFAULT_EXT) {
                    operationType = 'createRandomWithDefaultExt';
                    const randomName = `${uuidv4()}${defaultExtensionSetting}`;
                    filePathToUse = path.join(finalDefaultPath, randomName);
                } else if (selectedItem.id === ACTION_ID_CREATE_RANDOM_WITH_SPECIFIED_EXT) {
                    operationType = 'createRandomWithSpecifiedExt';
                    const specifiedExtension = selectedItem.filePath;
                    const randomName = `${uuidv4()}${specifiedExtension}`;
                    filePathToUse = path.join(finalDefaultPath, randomName);
                }
                else if (selectedItem.id === ACTION_ID_CREATE_TYPED_NEW) {
                    operationType = 'createNew';
                    filePathToUse = path.join(finalDefaultPath, selectedItem.filePath);
                } else {
                    filePathToUse = selectedItem.filePath;
                    operationType = selectedItem.wasDeleted ? 'recreateDeleted' : 'openExisting';
                }
                
                if (!filePathToUse) {
                    vscode.window.showInformationMessage(vscode.l10n.t('File path could not be determined. Operation cancelled.'));
                    quickPick.dispose();
                    return;
                }
                
                await processFileOperation(filePathToUse, operationType, context);
                quickPick.dispose();
            });

            quickPick.onDidHide(() => {
                if (!(quickPick as any)._disposed) { 
                     quickPick.dispose();
                }
            });
            quickPick.show();
        }
        
        async function processFileOperation(
            filePath: string, 
            operation: 'openExisting' | 'createNew' | 'recreateDeleted' | 'createRandomWithDefaultExt' | 'createRandomWithSpecifiedExt',
            currentContext: vscode.ExtensionContext
        ) {
            try {
                if (operation === 'createNew' || operation === 'recreateDeleted' || operation === 'createRandomWithDefaultExt' || operation === 'createRandomWithSpecifiedExt') {
                    let fileActuallyExists = false;
                    if (operation !== 'createRandomWithDefaultExt' && operation !== 'createRandomWithSpecifiedExt') { 
                        try {
                            await fs.access(filePath);
                            fileActuallyExists = true;
                        } catch { /* не существует */ }
                    }

                    if (!fileActuallyExists) {
                        await fs.writeFile(filePath, '', { encoding: 'utf8' });
                        vscode.window.showInformationMessage(vscode.l10n.t('File created: {0}', filePath));
                        createdThisSessionTempFiles.add(filePath);
                    } else if (operation === 'recreateDeleted') {
                        vscode.window.showInformationMessage(vscode.l10n.t('File already exists (was it restored or created externally?): {0}', filePath));
                    }
                }

                const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
                await vscode.window.showTextDocument(document, { preview: false });
                
                await updateHistory(currentContext, filePath);

            } catch (error: any) {
                const typedError = error as { message?: string };
                vscode.window.showErrorMessage(vscode.l10n.t('Error during file operation: {0}', typedError.message || String(error)));
            }
        }
        await showQuickPick();
    });

    context.subscriptions.push(disposable);
}

export async function deactivate() {
    console.log(vscode.l10n.t('Quick Temp File is deactivating!'));
    const configuration = vscode.workspace.getConfiguration('quickTempFile');
    const deleteOnExit = configuration.get<boolean>('deleteOnExit');

    if (deleteOnExit && createdThisSessionTempFiles.size > 0) {
        console.log(vscode.l10n.t('Should delete {0} files on exit.', createdThisSessionTempFiles.size.toString()));
        vscode.window.showInformationMessage(vscode.l10n.t('Attempting to delete {0} temporary file(s) created this session...', createdThisSessionTempFiles.size.toString()));

        const filesToDelete = Array.from(createdThisSessionTempFiles);
        const unlinkPromises: PromiseLike<void>[] = [];

        for (const filePath of filesToDelete) {
            unlinkPromises.push(
                fs.unlink(filePath)
                .then(() => {
                    console.log(vscode.l10n.t('Deleted temporary file on exit: {0}', filePath));
                })
                .catch(error => {
                    const typedError = error as { message?: string };
                    console.error(vscode.l10n.t('Failed to delete temporary file {0} on exit: {1}', filePath, typedError.message || String(error)));
                })
            );
        }

        if (unlinkPromises.length > 0) {
            console.log(vscode.l10n.t('Waiting for {0} files to be unlinked...', unlinkPromises.length.toString()));
            await Promise.allSettled(unlinkPromises);
        }
        
        createdThisSessionTempFiles.clear();

    } else if (deleteOnExit && createdThisSessionTempFiles.size === 0) {
        console.log(vscode.l10n.t('No temporary files created this session to clean.'));
    } else {
        console.log(vscode.l10n.t('Delete on exit is disabled in settings.'));
    }
}
