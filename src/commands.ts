import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { CreateFileArgs, HistoryEntry, QuickPickHistoryItem } from './types';
import { getRawHistory, removeFromHistory, updateHistory } from './history';

const ACTION_ID_CREATE_RANDOM_DEFAULT_EXT = '##ACTION_CREATE_RANDOM_DEFAULT_EXT##';
const ACTION_ID_CREATE_TYPED_NEW = '##ACTION_CREATE_TYPED_NEW##';
const ACTION_ID_CREATE_RANDOM_WITH_SPECIFIED_EXT = '##ACTION_CREATE_RANDOM_WITH_SPECIFIED_EXT##';

async function processAndOpenFile(
    filePath: string,
    content: string,
    context: vscode.ExtensionContext,
    createdThisSession: Set<string>,
    quiet: boolean = false,
): Promise<string> {
    try {
        const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
        if (!fileExists) {
            await fs.writeFile(filePath, content, { encoding: 'utf8' });
            if (!quiet) {
                vscode.window.showInformationMessage(vscode.l10n.t('File created: {0}', filePath));
            }
            createdThisSession.add(filePath);
        } else {
            if (content) {
                await fs.writeFile(filePath, content, { encoding: 'utf8' });
            } else if (!quiet) {
                vscode.window.showInformationMessage(vscode.l10n.t('File already exists (was it restored or created externally?): {0}', filePath));
            }
        }
        
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        await vscode.window.showTextDocument(document, { preview: false });
        await updateHistory(context, filePath);
        return filePath;
    } catch (error: any) {
        vscode.window.showErrorMessage(vscode.l10n.t('Error during file operation: {0}', error.message));
        throw error;
    }
}

async function prepareHistoryItems(currentHistory: HistoryEntry[]): Promise<QuickPickHistoryItem[]> {
    const items: QuickPickHistoryItem[] = [];
    const removeButtonTooltip = vscode.l10n.t('Remove from history');
    const deleteFileButtonTooltip = vscode.l10n.t('Delete file from disk');

    const removeButton: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('close'), tooltip: removeButtonTooltip };
    const deleteFileButton: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('trash'), tooltip: deleteFileButtonTooltip };

    for (const entry of currentHistory) {
        const fileExists = await fs.access(entry.filePath).then(() => true).catch(() => false);
        const directoryPath = path.dirname(entry.filePath);
        const historyItemButtons = [];
        if (fileExists) {
            historyItemButtons.push(deleteFileButton);
        }
        historyItemButtons.push(removeButton);

        items.push({
            label: entry.label,
            description: fileExists ? directoryPath : directoryPath + ' ' + vscode.l10n.t('(File deleted)'),
            filePath: entry.filePath,
            wasDeleted: !fileExists,
            buttons: historyItemButtons,
            iconPath: fileExists ? undefined : new vscode.ThemeIcon('warning')
        });
    }
    return items;
}

async function showQuickPickDialog(
    context: vscode.ExtensionContext,
    defaultPath: string,
    defaultExtension: string,
    createdThisSession: Set<string>,
    quiet: boolean = false,
): Promise<string | undefined> {
    
    return new Promise<string | undefined>(async (resolve) => {
        const quickPick = vscode.window.createQuickPick<QuickPickHistoryItem>();
        quickPick.placeholder = vscode.l10n.t('Enter new filename (in {0}) or select recent', defaultPath);
        quickPick.ignoreFocusOut = true;
        quickPick.matchOnDescription = true;
        quickPick.matchOnDetail = true;

        let currentBaseHistoryItems = await prepareHistoryItems(getRawHistory(context));

        const updateQuickPickDisplayAndActiveState = (inputValue: string) => {
            const newItems: QuickPickHistoryItem[] = [];
            const trimmedValue = inputValue.trim();
            let activeItemForFocus: QuickPickHistoryItem | undefined;

            if (!trimmedValue) {
                const randomItemDefaultExt: QuickPickHistoryItem = {
                    label: vscode.l10n.t('New file with random name'),
                    description: vscode.l10n.t('Extension: {0}', defaultExtension),
                    id: ACTION_ID_CREATE_RANDOM_DEFAULT_EXT,
                    filePath: '',
                    iconPath: new vscode.ThemeIcon('zap'),
                    alwaysShow: true
                };
                newItems.push(randomItemDefaultExt);
                activeItemForFocus = randomItemDefaultExt;
            } else if (trimmedValue.startsWith('.') && trimmedValue.length > 1) {
                const randomWithExtItem: QuickPickHistoryItem = {
                    label: vscode.l10n.t('New random file with extension: {0}', trimmedValue),
                    id: ACTION_ID_CREATE_RANDOM_WITH_SPECIFIED_EXT,
                    filePath: trimmedValue,
                    iconPath: new vscode.ThemeIcon('symbol-file'),
                    alwaysShow: true
                };
                newItems.push(randomWithExtItem);
                activeItemForFocus = randomWithExtItem;
            } else {
                const hasExtension = path.extname(trimmedValue);
                const filenameToCreate = hasExtension ? trimmedValue : `${trimmedValue}${defaultExtension}`;
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
            
            newItems.push(...currentBaseHistoryItems);
            quickPick.items = newItems;
            
            if (activeItemForFocus) {
                quickPick.activeItems = [activeItemForFocus];
            }
        };

        updateQuickPickDisplayAndActiveState(''); 
        quickPick.onDidChangeValue(updateQuickPickDisplayAndActiveState);

        quickPick.onDidTriggerItemButton(async (e) => {
            const item = e.item;
            if (e.button.tooltip === vscode.l10n.t('Remove from history')) {
                await removeFromHistory(context, item.filePath);
                if (!quiet) {
                    vscode.window.showInformationMessage(vscode.l10n.t('"{0}" removed from history.', item.label));
                }
                currentBaseHistoryItems = await prepareHistoryItems(getRawHistory(context));
                updateQuickPickDisplayAndActiveState(quickPick.value);
            } else if (e.button.tooltip === vscode.l10n.t('Delete file from disk')) {
                const confirmDelete = await vscode.window.showWarningMessage(
                    vscode.l10n.t('Are you sure you want to permanently delete the file "{0}"?', item.label),
                    { modal: true },
                    vscode.l10n.t('Delete')
                );
                if (confirmDelete === vscode.l10n.t('Delete')) {
                    try {
                        await fs.unlink(item.filePath);
                        if (!quiet) {
                            vscode.window.showInformationMessage(vscode.l10n.t('File "{0}" deleted from disk.', item.label));
                        }
                        await removeFromHistory(context, item.filePath);
                        currentBaseHistoryItems = await prepareHistoryItems(getRawHistory(context));
                        updateQuickPickDisplayAndActiveState(quickPick.value);
                    } catch (error: any) {
                        vscode.window.showErrorMessage(vscode.l10n.t('Failed to delete file "{0}" from disk. Error: {1}', item.label, error.message));
                    }
                }
            }
        });

        quickPick.onDidAccept(async () => {
            const selectedItem = quickPick.selectedItems[0];
            const typedValue = quickPick.value.trim();
            quickPick.hide();

            let filePathToUse: string | undefined;

            if (selectedItem) {
                switch(selectedItem.id) {
                    case ACTION_ID_CREATE_RANDOM_DEFAULT_EXT:
                        filePathToUse = path.join(defaultPath, `${uuidv4()}${defaultExtension}`);
                        break;
                    case ACTION_ID_CREATE_RANDOM_WITH_SPECIFIED_EXT:
                        filePathToUse = path.join(defaultPath, `${uuidv4()}${selectedItem.filePath}`);
                        break;
                    case ACTION_ID_CREATE_TYPED_NEW:
                        filePathToUse = path.join(defaultPath, selectedItem.filePath);
                        break;
                    default:
                        filePathToUse = selectedItem.filePath;
                        break;
                }
            } else if (typedValue) {
                if (typedValue.startsWith('.') && typedValue.length > 1) {
                    filePathToUse = path.join(defaultPath, `${uuidv4()}${typedValue}`);
                } else {
                    const hasExtension = path.extname(typedValue);
                    const filenameToCreate = hasExtension ? typedValue : `${typedValue}${defaultExtension}`;
                    filePathToUse = path.join(defaultPath, filenameToCreate);
                }
            }
            
            if (!filePathToUse) {
                if (!quiet) {
                    vscode.window.showInformationMessage(vscode.l10n.t('Operation cancelled or no input provided.'));
                }
                resolve(undefined);
                return;
            }

            try {
                const resultPath = await processAndOpenFile(filePathToUse, '', context, createdThisSession, quiet);
                resolve(resultPath);
            } catch (error) {
                resolve(undefined);
            }
        });

        quickPick.onDidHide(() => {
            resolve(undefined);
            quickPick.dispose();
        });

        quickPick.show();
    });
}



export async function createFile(
    context: vscode.ExtensionContext,
    createdThisSession: Set<string>,
    args: CreateFileArgs = {}
): Promise<string | undefined> {
    const configuration = vscode.workspace.getConfiguration('quickTempFile');
    const finalExtension = args.extension || configuration.get<string>('defaultExtension', '.txt');
    let finalPath: string;

    if (typeof args.directory === 'string') {
        finalPath = args.directory;
    } else if (args.directory === null) {
        finalPath = os.tmpdir();
    } else {
        finalPath = configuration.get<string>('defaultPath') || os.tmpdir();
    }

    if (finalPath.startsWith('~')) {
        finalPath = path.join(os.homedir(), finalPath.slice(1));
    }
    
    try {
        await fs.mkdir(finalPath, { recursive: true });
    } catch (error: any) {
        vscode.window.showErrorMessage(vscode.l10n.t('Failed to create or access default path: {0}. Error: {1}', finalPath, error.message));
        return;
    }

    if (args.noDialog || args.filename) {
        let finalFilename = args.filename;
        if (!finalFilename) {
            finalFilename = `${uuidv4()}${finalExtension}`;
        } else if (path.extname(finalFilename) === '') {
            finalFilename += finalExtension;
        }
        
        const filePath = path.join(finalPath, finalFilename);
        return processAndOpenFile(filePath, args.content || '', context, createdThisSession, args.quiet || false);
    } else {
        return showQuickPickDialog(context, finalPath, finalExtension, createdThisSession, args.quiet || false);
    }
}