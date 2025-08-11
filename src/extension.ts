import * as vscode from 'vscode';
import { updateActiveEditor } from './groups/active';
import { chooseFileToFixDeps } from './groups/fixdeps';
import { ActiveFile } from './model/activeFile';
import { uriToBuild } from './util/filepathtools';
import { packageTooLarge } from './util/packagetools';
import { removeDeps } from './groups/remove';
import { addDeps } from './groups/add';
import { shutdownBazelHard } from './util/exectools';
import { onCreateOrDeleteFile } from './groups/file';
import { getConfig, OPEN_BAZEL_COMMAND, FIX_DEPS_COMMAND } from './config/config';
import { BAZELSHUTDOWN, ENABLEADDITION, ENABLEDELETION } from './config/generated';

export async function activate(context: vscode.ExtensionContext) {
    const bazelCommand = vscode.commands.registerCommand(OPEN_BAZEL_COMMAND, async () => {
        const activeUri = vscode.window.activeTextEditor?.document.uri;    
        if (activeUri) {
            const currTargetPair = uriToBuild(activeUri);
            if (currTargetPair) {
                const buildFileUri = currTargetPair[1];
                vscode.workspace.openTextDocument(buildFileUri);
            }
        }
    });

    const changeEditorListener = vscode.window.onDidChangeActiveTextEditor(updateActiveEditor);

    const changeTextListener = vscode.workspace.onDidChangeTextDocument(async (changeEvent: vscode.TextDocumentChangeEvent) => {
        if (changeEvent.contentChanges.length === 0 || changeEvent.document.uri.fsPath !== vscode.window.activeTextEditor?.document.uri.fsPath) {
            return; // skip empty changes and changes from other documents
        }

        // Save the current instance of file so a change in the active file won't break the analysis
        const savedActiveFile = ActiveFile.data;
        // DELETIONS
        if (savedActiveFile && !packageTooLarge() && getConfig(ENABLEDELETION)) {
            removeDeps(changeEvent, savedActiveFile);
            ActiveFile.data.documentState = changeEvent.document.getText(); 
        }
        if (getConfig(ENABLEADDITION)) {
            addDeps(changeEvent, savedActiveFile);
        }
    });

    const fileCreationListener = vscode.workspace.onDidCreateFiles(onCreateOrDeleteFile);

    const fileDeletionListener = vscode.workspace.onDidDeleteFiles(onCreateOrDeleteFile);

    const statusBarCommand = activateStatusBarCommand();

    context.subscriptions.push(
        bazelCommand, 
        changeEditorListener, 
        changeTextListener, 
        activeStatusBarItem, 
        statusBarCommand, 
        fileCreationListener, 
        fileDeletionListener
    );
    if (getConfig(BAZELSHUTDOWN)) {
        await shutdownBazelHard();
    }

    await updateActiveEditor(vscode.window.activeTextEditor);
}

export enum ExtensionState {
    ready,
    waiting,
    inactive,
    active
}

/**
 * For internal testing and monitoring
 * State that monitors the resolution of extension handlers
 */
let extensionState: ExtensionState = ExtensionState.inactive;

export function getExtensionState(): ExtensionState {
    return extensionState; 
}

/**
 * For testing and monitoring
 * @param state updates the state of the extension
 */
export function setExtensionState(state: ExtensionState): void {
    extensionState = state; 
}

const activeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

export function updateStatusBar(tooltip: string | vscode.MarkdownString | undefined, text?: string) {
    activeStatusBarItem.tooltip = tooltip;
    if (text !== undefined) {
        activeStatusBarItem.text = text;
    }
}

function activateStatusBarCommand(): vscode.Disposable {
    activeStatusBarItem.text = '$(wand)';
    activeStatusBarItem.tooltip = 'Run dependency fixup on a bazel package';
    activeStatusBarItem.command = FIX_DEPS_COMMAND;
    activeStatusBarItem.show();
    return vscode.commands.registerCommand(FIX_DEPS_COMMAND, chooseFileToFixDeps);
}

// TODO: cleanup listeners
export function deactivate() {

}
