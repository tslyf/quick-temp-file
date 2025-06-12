import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { createFile } from './commands';
import { CreateFileArgs } from './types';
import { removeFromHistory } from './history';
import { pathEqual } from './utils';

const createdThisSessionTempFiles = new Set<string>();
let cleanupListener: vscode.Disposable | undefined;

function updateCleanupListener(context: vscode.ExtensionContext) {
    if (cleanupListener) {
        cleanupListener.dispose();
        cleanupListener = undefined;
    }

    const configuration = vscode.workspace.getConfiguration('quickTempFile');
    const strategy = configuration.get<string>('cleanupStrategy');

    if (strategy === 'onEditorClose') {
        cleanupListener = vscode.window.tabGroups.onDidChangeTabs(async (event) => {
            if (event.closed.length === 0) {
                return;
            }

            for (const tab of event.closed) {
                if (tab.input instanceof vscode.TabInputText) {
                    const closedPath = tab.input.uri.fsPath;
                    let fileToDelete: string | undefined;
                    for (const trackedPath of createdThisSessionTempFiles) {
                        if (pathEqual(trackedPath, closedPath)) {
                            fileToDelete = trackedPath;
                            break;
                        }
                    }

                    if (fileToDelete) {
                        try {
                            await fs.unlink(fileToDelete);
                            createdThisSessionTempFiles.delete(fileToDelete);
                            await removeFromHistory(context, fileToDelete);
                            console.log(vscode.l10n.t('Temporary file deleted on close: {0}', fileToDelete));
                        } catch (err: any) {
                            if (err.code !== 'ENOENT') {
                                console.error(vscode.l10n.t('Failed to delete temporary file {0} on close: {1}', fileToDelete, err.message));
                            }
                        }
                    }
                }
            }
        });

        context.subscriptions.push(cleanupListener);
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log(vscode.l10n.t('Quick Temp File is now active!'));

    updateCleanupListener(context);

    const onDidChangeConfigurationDisposable = vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('quickTempFile.cleanupStrategy')) {
            updateCleanupListener(context);
        }
    });

    const internalCommand = vscode.commands.registerCommand(
        'quickTempFile.api.create',
        (args: CreateFileArgs): Promise<string | undefined> => {
            return createFile(context, createdThisSessionTempFiles, args);
        }
    );

    const dialogCommand = vscode.commands.registerCommand('quickTempFile.create', () => {
        vscode.commands.executeCommand('quickTempFile.api.create', {});
    });

    const noDialogCommand = vscode.commands.registerCommand('quickTempFile.createNoDialog', () => {
        vscode.commands.executeCommand('quickTempFile.api.create', { noDialog: true });
    });

    context.subscriptions.push(internalCommand, dialogCommand, noDialogCommand, onDidChangeConfigurationDisposable);
}

export async function deactivate(): Promise<void> {
    const configuration = vscode.workspace.getConfiguration('quickTempFile');
    const strategy = configuration.get<string>('cleanupStrategy') || 'never';

    console.log(vscode.l10n.t('Quick Temp File is deactivating!'));

    if (strategy !== 'onWindowClose') {
        console.log(vscode.l10n.t('Cleanup on exit is disabled by current strategy ({0}).', strategy));
        return;
    }
    
    if (createdThisSessionTempFiles.size === 0) {
        console.log(vscode.l10n.t('No temporary files created this session to clean.'));
        return;
    }
    
    console.log(vscode.l10n.t('Attempting to delete {0} temporary file(s) created this session...', createdThisSessionTempFiles.size.toString()));

    const deletionPromises = Array.from(createdThisSessionTempFiles).map(filePath => 
        fs.unlink(filePath).catch(err => {
            if (err.code !== 'ENOENT') { 
                console.error(vscode.l10n.t('Failed to delete temporary file {0} on exit: {1}', filePath, err.message));
            }
        })
    );
    
    await Promise.allSettled(deletionPromises);
    createdThisSessionTempFiles.clear();
    console.log(vscode.l10n.t('Session cleanup finished.'));
}
