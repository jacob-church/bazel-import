import * as vscode from 'vscode';
import { uriToContainingUri } from './uritools';
import { uriToBuildTarget } from './targettools';
import { getBuildTargetsFromFile, getBuildTargetsFromAdditions, getBuildTargetsFromDeletions } from './deletion/removedeps';
import { showDismissableFileMessage, showDismissableMessage } from './userinteraction';
import { packageTooLarge, updateActiveEditor } from './deletion/active';
import * as path from 'path';
import { statusBarOptions } from './analysis/deps';
import { executeCommand, handleBuildozerError } from './analysis/executil';
import { ActiveFile, ActiveFileData } from './model/activeFile';
import { uriToBuild } from './deletion/filepathtools';

export const STATUS_BAR_COMMAND_ID = "bazel-import.showStatusBarOptions";
export const BUILD_FILE = vscode.workspace.getConfiguration('bazel-import').buildFile;
export const TS_LANGUAGE_ID = 'typescript';

export async function activate(context: vscode.ExtensionContext) {
    const bazelCommand = vscode.commands.registerCommand('bazel-import.openBazel', async () => {
        const activeUri = vscode.window.activeTextEditor?.document.uri;    
        if (activeUri) {
            const currTargetPair = await uriToBuildTarget(uriToContainingUri(activeUri));
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
        if (!packageTooLarge() && vscode.workspace.getConfiguration('bazel-import').enableDeletion) {
            deleteDeps(changeEvent, savedActiveFile);
            ActiveFile.data.documentState = changeEvent.document.getText(); 
            extensionState = ExtensionState.ready;
        }
        addDeps(changeEvent, savedActiveFile);
    });

    const statusBarCommand = activateStatusBarCommand();

    context.subscriptions.push(bazelCommand, changeEditorListener, changeTextListener, activeStatusBarItem, statusBarCommand);

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
export let extensionState: ExtensionState = ExtensionState.inactive;

/**
 * For testing and monitoring
 * @param state updates the state of the extension
 */
export function setExtensionState(state: ExtensionState): void {
    extensionState = state; 
}

export const activeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

export function updateStatusBar(tooltip: string | vscode.MarkdownString | undefined, text?: string) {
    activeStatusBarItem.tooltip = tooltip;
    if (text !== undefined) {
        activeStatusBarItem.text = text;
    }
}

/** 
 * Checks if the new document is in the old document's directory (i.e., does not need package update)
*/
export function handleActiveFileDirectoryChange(document: vscode.TextDocument) {
    let oldDir = undefined; 
    if (ActiveFile.data) {
        oldDir = uriToContainingUri(ActiveFile.data.buildUri);
    }

    let newDir = uriToContainingUri(document.uri); 
    if (newDir.toString() === oldDir?.toString()) {
        console.log("No need to reload the build packages");
        ActiveFile.data.uri = document.uri;
        ActiveFile.data.documentState = document.getText(); 
        return undefined;
    }
    return newDir; 
}

// TODO MOVE
async function getBuildTargetsFromPackage(packageSources: vscode.Uri[]) {
    return (await Promise.all(packageSources.map(async uri => getBuildTargetsFromFile(uri!)))).flat();
} 

// TODO MOVE
function validateDeletions(remainingDependencies: string[], deletedImports: Set<string>): string {
    for (const target of remainingDependencies) {
        if (deletedImports.delete(target)) {
            console.debug(`${target} dep still exists\n`);
        } 
        if (deletedImports.size === 0) {
            break; 
        }
    }
    return Array.from(deletedImports).join(' ');
}

// DELETION
async function deleteDeps(changeEvent: vscode.TextDocumentChangeEvent, changedFile: ActiveFileData | undefined) {
    if (changedFile === undefined) {
        return;
    }

    extensionState = ExtensionState.waiting;

    // Find the build file(s) for deleted imports
    const deletedDeps: Set<string> = getBuildTargetsFromDeletions(changedFile.documentState, changeEvent);
    if (deletedDeps.size === 0) {
        return;
    }
    deletedDeps.delete(changedFile.target);

    if (deletedDeps.size === 0) {
        showDismissableMessage("Bazel deps not removed (deleted import is in package)");
        return; 
    }

    // Evaluate remaining imports to see if they depend on any of the build files from the deleted imports //TODO Factor this out
    const remainingDependencies = await getBuildTargetsFromPackage(changedFile.packageSources);
    
    const targetDepsToRemove = validateDeletions(remainingDependencies, deletedDeps);

    // No build files left - Return
    if (targetDepsToRemove.trim().length === 0) {
        showDismissableMessage("Bazel deps not removed (dependency still exists)");
        return; 
    }

    // Step 4: If there are build files left, removed those dependencies from the target BUILD.bazel
    try {
        const buildozer = `buildozer "remove deps ${targetDepsToRemove}" "${changedFile.target}"`;
        console.log(`Executing: ${buildozer}`);
        executeCommand(buildozer, path.dirname(changedFile.uri.fsPath));
        showDismissableFileMessage(`Bazel deps removed from ${BUILD_FILE}`, changedFile.buildUri);
    } catch (error) {
        handleBuildozerError({ error, msgSuccess: "No deps removed", msgFail: "Failed to remove deps", uri: changedFile.buildUri});
    }    
}

// ADDITION
async function addDeps(changeEvent: vscode.TextDocumentChangeEvent, changedFile: ActiveFileData | undefined) {
    let buildFileUri: vscode.Uri | undefined; // let's assert that the changeEvent matches the currently open text editor; that will filter out changes that come from other sources
    
    // Step 1: Determine the current build target (e.g. where are we adding new dependencies to?)
    let currentTargetPair: [string, vscode.Uri] | undefined;
    if (!changedFile) {
        currentTargetPair = uriToBuild(changeEvent.document.uri);
    }
    const currentTarget = changedFile?.target ?? currentTargetPair?.[0];
    buildFileUri = changedFile?.buildUri ?? currentTargetPair?.[1];
    if (!currentTarget) {
        return;
    }

    // Step 2: Get the build targets from the added imports
    const targets = getBuildTargetsFromAdditions(changeEvent);
    if (targets.size === 0) {
        return;
    }
    console.debug("Added Targets", targets);

    // Step 3: Do the update
    const deps = Array.from(targets).join(' ');
    const buildozer = `buildozer "add deps ${deps}" "${currentTarget}"`;
    try {
        await executeCommand(buildozer, path.dirname(changeEvent.document.uri.fsPath));
        showDismissableFileMessage(`Bazel deps added to ${BUILD_FILE}`, buildFileUri);
    }
    catch (error) {
        handleBuildozerError({
            error,
            msgSuccess: `Nothing added to ${BUILD_FILE}`,
            msgFail: `Command failed: Something might be wrong with ${BUILD_FILE}`, 
            uri: buildFileUri
        });
    }
}

function activateStatusBarCommand(): vscode.Disposable {
    activeStatusBarItem.text = '$(wand)';
    activeStatusBarItem.tooltip = 'Run dependency fixup on a bazel package';
    activeStatusBarItem.command = STATUS_BAR_COMMAND_ID;
    activeStatusBarItem.show();
    return vscode.commands.registerCommand(STATUS_BAR_COMMAND_ID, statusBarOptions);
}

// TODO: cleanup listeners
export function deactivate() {

}
