import * as vscode from 'vscode';
import {uriToContainingUri} from './uritools';
import {uriToBuildTarget} from './targettools';
import {positionsFromTextChanges, urisFromTextChanges} from './importparse';
import {getImportedTargets} from './bazeltools';
import { getBuildTargetFromFP, getBuildTargetsFromFile, getDeletionTargets } from './removedeps';
import { updateMaxPackageSize } from './userinteract';
import { updateActiveEditor } from './active';
import path = require('path');

const OPEN_BUTTON = 'Open';
const CHANGE_PACKAGE_LIMIT_BUTTON = 'Change max package size';
const DISMISS_BUTTON = "Don't show this again";
export const TS_LANGUAGE_ID = 'typescript';

let terminal: vscode.Terminal | undefined = undefined;


export interface ActiveFile {
    documentState: string,
    uri: vscode.Uri,
    target: string,
    buildUri: vscode.Uri,
    packageSources: vscode.Uri[],
}

let activeFile: ActiveFile | undefined;

export let deletionEnabled = false; 

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
        // TODO: relegate to status bar? Something like '$(error)' with the tooltip explaining error and a command that works? I think that would be worse
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

    // TODO: Keep in status bar? 
    vscode.window.showInformationMessage(
        `${path.basename(vscode.window.activeTextEditor?.document.uri.fsPath ?? "undefined")} opened with deletion ${deletion}`
    );
}

export function getEnabledStatus() {
    return deletionEnabled ? 'enabled' : 'disabled';
}

export function activate(context: vscode.ExtensionContext) {
    vscode.commands.registerCommand('bazel-import.openBazel', async () => {
        const activeUri = vscode.window.activeTextEditor?.document.uri;
        if (activeUri) {
            const currTargetPair = await uriToBuildTarget(uriToContainingUri(activeUri));
            if (currTargetPair) {
                const buildFileUri = currTargetPair[1];
                vscode.workspace.openTextDocument(buildFileUri);
            }
        }
    });

    vscode.window.onDidChangeActiveTextEditor(updateActiveEditor);

    vscode.workspace.onDidChangeTextDocument(async (changeEvent: vscode.TextDocumentChangeEvent) => {
        if (changeEvent.contentChanges.length === 0 || changeEvent.document.uri.fsPath !== vscode.window.activeTextEditor?.document.uri.fsPath) {
            return; // skip empty changes and changes from other documents
        }
        const targets = new Set(); // if changeEvent.document !== window.activeTextEditor?.document, we should ignore this change
        let buildFileUri: vscode.Uri | undefined; // let's assert that the changeEvent matches the currently open text editor; that will filter out changes that come from other sources

        // DELETIONS
        if (deletionEnabled && activeFile) {
            
            // Step 1: Get the import deletions for evaluation 
            const deletedImports = getDeletionTargets(activeFile.documentState, changeEvent);

            // Step 2: Find the build file(s) for deleted imports
            const deletedDeps: Set<string> = new Set(); 
            for (const deletedImport of deletedImports) {
                const buildUri = await getBuildTargetFromFP(deletedImport, uriToContainingUri(activeFile.uri));
                deletedDeps.add(buildUri[0]); 
            }
            console.log('Deleted dependencies', deletedDeps); 

            // Step 3: Evaluate remaining imports to see if they connect to any of the build files 
            // from the deleted imports [remove these build files if so (convert to set for deletion?)]
            // TODO: does this need a mutex?
            const allDeps = await Promise.all(activeFile.packageSources.map(async uri => getBuildTargetsFromFile(uri!))); 
            console.log(allDeps); 
            for (let [target, _] of allDeps.flat() as [string, vscode.Uri][]) {
                deletedDeps.delete(target); 
                if (deletedDeps.size === 0) {
                    break; 
                }
            } 

            // Step 4: If there are build files left, removed those dependencies from the target BUILD.bazel
            console.log("Deps to still delete: ", deletedDeps); 
            if (!terminal) {
                terminal = vscode.window.createTerminal({
                    hideFromUser: true,
                    isTransient: true,
                });
            }
            const deps = Array.from(deletedDeps).join(' ');
            if (deps.trim().length === 0) {
                vscode.window.showInformationMessage("Bazel deps not removed (dependency still exists)");
                return; 
            }
            const buildozer = `buildozer "remove deps ${deps}" "${activeFile.target}"`;
            console.log(`Executing: ${buildozer}`);
            terminal.sendText(buildozer);
            if (vscode.workspace.getConfiguration('bazel-import').notifyChange) {
                const buildFile = vscode.workspace.getConfiguration('bazel-import').buildFile;
                vscode.window
                    .showInformationMessage(`Bazel deps removed from ${buildFile}`, OPEN_BUTTON, DISMISS_BUTTON)
                    .then((button) => {
                        if (button === OPEN_BUTTON && activeFile?.buildUri) {
                            vscode.window.showTextDocument(activeFile.buildUri);
                        }
                        if (button === DISMISS_BUTTON) {
                            vscode.workspace.getConfiguration('bazel-import').update('notifyChange', false);
                        }
                    });
            }
            // Step 5: Update document state
            activeFile.documentState = changeEvent.document.getText(); 
            
        }

        // Step 1: Find symbol position for dependency lookup and external build targets (e.g. @angule/core)
        const [positions, externalTargets] = positionsFromTextChanges(changeEvent.contentChanges);
        externalTargets.forEach((val) => targets.add(val));
        if (positions.length + externalTargets.size === 0) {
            return;
        }

        // Step 2: Determine the current build target (e.g. where are we adding new dependencies to?) [DELETE] 
        // TODO: refactor so it evaluates whether the current target exists (which it should)
        const currentUri = uriToContainingUri(changeEvent.document.uri);
        const currentTargetPair = await uriToBuildTarget(currentUri);
        const currentTarget = currentTargetPair?.[0];
        buildFileUri = currentTargetPair?.[1];
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
        if (vscode.workspace.getConfiguration('bazel-import').notifyChange) {
            const buildFile = vscode.workspace.getConfiguration('bazel-import').buildFile;
            vscode.window
                .showInformationMessage(`Bazel deps added to ${buildFile}`, OPEN_BUTTON, DISMISS_BUTTON)
                .then((button) => {
                    if (button === OPEN_BUTTON && buildFileUri) {
                        vscode.window.showTextDocument(buildFileUri);
                    }
                    if (button === DISMISS_BUTTON) {
                        vscode.workspace.getConfiguration('bazel-import').update('notifyChange', false);
                    }
                });
        }
    });
}

// TODO: cleanup listeners
export function deactivate() {
    terminal?.dispose();
}
