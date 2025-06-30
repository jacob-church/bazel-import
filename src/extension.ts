import * as vscode from 'vscode';
import {uriToContainingUri} from './uritools';
import {uriToBuildTarget} from './targettools';
import {positionsFromTextChanges, urisFromTextChanges} from './importparse';
import {getImportedTargets} from './bazeltools';
import { getBuildTargetFromFP, getBuildTargetsFromFile, getDeletionTargets } from './deletion/removedeps';
import { showDismissableFileMessage, showDismissableMessage, updateMaxPackageSize } from './userinteraction';
import { updateActiveEditor } from './deletion/active';
import * as path from 'path';
import { statusBarOptions } from './analysis/deps';


const CHANGE_PACKAGE_LIMIT_BUTTON = 'Change max package size';
export const STATUS_BAR_COMMAND_ID = "bazel-import.showStatusBarOptions";

export const BUILD_FILE = vscode.workspace.getConfiguration('bazel-import').buildFile;
export const TS_LANGUAGE_ID = 'typescript';

export let terminal: vscode.Terminal | undefined = undefined;

/**
 * Updates the terminal (used for testing to mock behavior)
 * @param update A mocked terminal
 */

export function setTerminal(update: vscode.Terminal) {
    terminal = update;
}

/**
 * Returns the current terminal
 * @returns vscode.Terminal
 */
export function getTerminal() {
    return terminal; 
}

export function runTerminal(text: string) {
    terminal?.sendText(text);
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

/**
 * @returns the current state of the extension handlers
 */
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

/**
 * Stores relevant information about the current active editor
 */
export interface ActiveFile {
    documentState: string,
    uri: vscode.Uri,
    target: string,
    buildUri: vscode.Uri,
    packageSources: vscode.Uri[],
}

let activeFile: ActiveFile | undefined;

// Toggle that is set after the active file is loaded
let deletionEnabled = false; 

// HELPER FUNCTIONS
export function setCurrDocument(documentContents: string) {
    if (activeFile) {
        activeFile.documentState = documentContents; 
    }
}

const activeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

export function getStatusBarItem() {
    return activeStatusBarItem;
}

export function getActiveFile(): ActiveFile | undefined {
    return activeFile; 
}

export function setActiveFile(update: ActiveFile) {
    activeFile = update;
}

/** 
 * Checks if the new document is in the old document's directory (i.e., does not need package update)
*/
export function handleActiveFileDirectoryChange(document: vscode.TextDocument) {
    let oldDir = undefined; 
    if (activeFile) {
        oldDir = uriToContainingUri(activeFile.buildUri);
    }

    let newDir = uriToContainingUri(document.uri); 
    if (newDir.toString() === oldDir?.toString()) {
        console.log("No need to reload the build packages");
        activeFile!.uri = document.uri;
        activeFile!.documentState = document.getText(); 
        deletionEnabled = true; 
        return undefined;
    }
    deletionEnabled = false; 
    return newDir; 
}

/**
 * Sets the deletion enabled flag depending on the size of the current package and informs user of status
 */ 
export function validatePackageSize() {
    const maxPackageSize: number = vscode.workspace.getConfiguration('bazel-import').maxPackageSize; 
    // If there are too many sources in the packages, deletion analysis won't run
    if ((activeFile?.packageSources.length ?? maxPackageSize + 1) <= maxPackageSize) {
        deletionEnabled = true; 
    }
    else {
        vscode.window
            .showWarningMessage(
                `Too many files in package. Increase max package size? (current max: ${maxPackageSize})`, 
                CHANGE_PACKAGE_LIMIT_BUTTON
            ).then((button) => {
                if (button === CHANGE_PACKAGE_LIMIT_BUTTON) {
                    updateMaxPackageSize(); 
                }
            });
    }
    
    const deletion = getEnabledStatus();
    if (!vscode.workspace.getConfiguration('bazel-import').notifyChange) {
        return; 
    }
    showDismissableMessage(
        `${path.basename(vscode.window.activeTextEditor?.document.uri.fsPath ?? "undefined")} opened with deletion ${deletion}`
    );
}

export function getEnabledStatus() {
    return deletionEnabled ? 'enabled' : 'disabled';
}

// DELETION
async function deleteDeps(changeEvent: vscode.TextDocumentChangeEvent) {
    if (activeFile === undefined) {
        return;
    }
    setExtensionState(ExtensionState.waiting);

    // Get the import deletions for evaluation 
    const deletedImports = getDeletionTargets(activeFile.documentState, changeEvent);
    if (deletedImports.length === 0) {
        return;
    }

    activeStatusBarItem.text = '$(sync~spin)';
    const beforeTip = activeStatusBarItem.tooltip;
    activeStatusBarItem.tooltip = 'Getting build files';

    // Find the build file(s) for deleted imports
    const deletedDeps: Set<string> = new Set(); 
    const buildUris = deletedImports.map(deletedImport => getBuildTargetFromFP(deletedImport, activeFile!.uri));
    for (const buildUri of buildUris) {
        if (buildUri[0] !== activeFile.target) {
            deletedDeps.add(buildUri[0]); 
        }
    }

    if (deletedDeps.size === 0) {
        showDismissableMessage("Bazel deps not removed (deleted import is in package)");
        activeStatusBarItem.text = '$(wand)';
        activeStatusBarItem.tooltip = beforeTip;
        setExtensionState(ExtensionState.ready);
        return; 
    }
    
    activeStatusBarItem.tooltip = `Analyzing ${deletedDeps.size} import(s)\n`;

    // Evaluate remaining imports to see if they connect to any of the build files from the deleted imports
    const allDeps = await Promise.all(activeFile.packageSources.map(async uri => getBuildTargetsFromFile(uri!))); 
    console.log(allDeps.flat()); 
    for (let [target, _] of allDeps.flat() as [string, vscode.Uri][]) {
        if (deletedDeps.delete(target)) {
            console.log(`${target} dep still exists\n`);
        } 
        if (deletedDeps.size === 0) {
            break; 
        }
    }
    const deps = Array.from(deletedDeps).join(' ');

    // No build files left - Return
    if (deps.trim().length === 0) {
        showDismissableMessage("Bazel deps not removed (dependency still exists)");
        activeStatusBarItem.text = '$(wand)';
        activeStatusBarItem.tooltip = beforeTip;
        setExtensionState(ExtensionState.ready);
        return; 
    }

    // Step 4: If there are build files left, removed those dependencies from the target BUILD.bazel
    if (!terminal) {
        terminal = vscode.window.createTerminal({
            hideFromUser: true,
            isTransient: true,
        });
    }
    const buildozer = `buildozer "remove deps ${deps}" "${activeFile.target}"`;
    console.log(`Executing: ${buildozer}`);
    terminal.sendText(buildozer);
    showDismissableFileMessage(`Bazel deps removed from ${BUILD_FILE}`, activeFile?.buildUri);

    // Step 5: Update document state
    activeStatusBarItem.text = '$(wand)';
    activeStatusBarItem.tooltip = beforeTip;
    activeFile.documentState = changeEvent.document.getText(); 
    setExtensionState(ExtensionState.ready);
}


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
        const targets = new Set(); // if changeEvent.document !== window.activeTextEditor?.document, we should ignore this change
        let buildFileUri: vscode.Uri | undefined; // let's assert that the changeEvent matches the currently open text editor; that will filter out changes that come from other sources

        // DELETIONS
        if (deletionEnabled && vscode.workspace.getConfiguration('bazel-import').enableDeletion) {
            deleteDeps(changeEvent);
        }

        // Step 1: Find symbol position for dependency lookup and external build targets (e.g. @angule/core)
        const [positions, externalTargets] = positionsFromTextChanges(changeEvent.contentChanges);
        externalTargets.forEach((val) => targets.add(val));
        if (positions.length + externalTargets.size === 0) {
            return;
        }

        // Step 2: Determine the current build target (e.g. where are we adding new dependencies to?) [DELETE] 
        const currentUri = activeFile?.uri ?? uriToContainingUri(changeEvent.document.uri);
        let currentTargetPair: [string, vscode.Uri] | undefined;
        if (!activeFile) {
            currentTargetPair = await uriToBuildTarget(currentUri);
        }
        const currentTarget = activeFile?.target ?? currentTargetPair?.[0];
        buildFileUri = activeFile?.buildUri ?? currentTargetPair?.[1];
        if (!currentTarget) {
            return;
        }

        // Step 3: Lookup Symbols and find the file paths where they are defined
        const uris = await urisFromTextChanges(positions, changeEvent.document.uri);
        if (uris.length === 0) {
            return;
        }

        // Step 4: Convert file paths to relevant build targets
        const depTargets = await getImportedTargets(uris, currentTarget);
        depTargets.forEach((val) => targets.add(val));
        if (targets.size === 0) {
            return;
        }

        // Step 5: Do the update
        if (!terminal) {
            terminal = vscode.window.createTerminal({
                hideFromUser: true,
                isTransient: true,
            });
        }
        const deps = Array.from(targets).join(' ');
        const buildozer = `buildozer "add deps ${deps}" "${currentTarget}"`;
        console.log(`Executing: ${buildozer}`);
        terminal.sendText(buildozer);
        showDismissableFileMessage(`Bazel deps added to ${BUILD_FILE}`, buildFileUri);
    });

    activeStatusBarItem.text = '$(wand)';
    activeStatusBarItem.tooltip = 'Run dependency fixup on a bazel package';
    activeStatusBarItem.command = STATUS_BAR_COMMAND_ID;
    const statusBarCommand = vscode.commands.registerCommand(STATUS_BAR_COMMAND_ID, statusBarOptions);
    activeStatusBarItem.show();

    context.subscriptions.push(bazelCommand, changeEditorListener, changeTextListener, activeStatusBarItem, statusBarCommand);

    await updateActiveEditor(vscode.window.activeTextEditor);
}

// TODO: cleanup listeners
export function deactivate() {
    terminal?.dispose();
}
