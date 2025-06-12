import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { createFile } from './commands';
import { CreateFileArgs } from './types';

const createdThisSessionTempFiles = new Set<string>();

export function activate(context: vscode.ExtensionContext) {
    console.log(vscode.l10n.t('Quick Temp File is now active!'));

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

    context.subscriptions.push(internalCommand, dialogCommand, noDialogCommand);
}

export async function deactivate(): Promise<void> {
    const configuration = vscode.workspace.getConfiguration('quickTempFile');
    const deleteOnExit = configuration.get<boolean>('deleteOnExit');
    
    console.log(vscode.l10n.t('Quick Temp File is deactivating!'));

    if (!deleteOnExit) {
        console.log(vscode.l10n.t('Delete on exit is disabled in settings.'));
        return;
    }
    
    if (createdThisSessionTempFiles.size === 0) {
        console.log(vscode.l10n.t('No temporary files created this session to clean.'));
        return;
    }
    
    console.log(vscode.l10n.t('Should delete {0} files on exit.', createdThisSessionTempFiles.size.toString()));
    vscode.window.showInformationMessage(vscode.l10n.t('Attempting to delete {0} temporary file(s) created this session...', createdThisSessionTempFiles.size.toString()));

    const deletionPromises = Array.from(createdThisSessionTempFiles).map(filePath => 
        fs.unlink(filePath).then(() => {
            console.log(vscode.l10n.t('Deleted temporary file on exit: {0}', filePath));
        }).catch(err => {
            if (err.code !== 'ENOENT') { 
                console.error(vscode.l10n.t('Failed to delete temporary file {0} on exit: {1}', filePath, err.message));
            }
        })
    );
    
    if (deletionPromises.length > 0) {
        console.log(vscode.l10n.t('Waiting for {0} files to be unlinked...', deletionPromises.length.toString()));
        await Promise.allSettled(deletionPromises);
    }

    createdThisSessionTempFiles.clear();
}
