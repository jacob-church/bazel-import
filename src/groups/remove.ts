import * as vscode from 'vscode';
import {getBuildTargetsFromFile} from '../util/filetools';
import {showDismissableFileMessage, showDismissableMessage} from '../userinteraction';
import * as path from 'path';
import {executeCommand, handleBuildozerError} from '../util/exectools';
import {ActiveFile, ActiveFileData} from '../model/activeFile';
import {getBuildTargetsFromDeletions} from '../util/eventtools';
import {BUILD_FILE, ExtensionState, extensionState, setExtensionState} from '../extension';
import { getBuildTargetsFromPackage } from '../util/packagetools';
import { uriEquals } from '../util/uritools';
import { updateBuildDeps } from '../util/exectools';

// DELETION
export async function removeDeps(changeEvent: vscode.TextDocumentChangeEvent, changedFile: ActiveFileData) {
    if (!uriEquals(changeEvent.document.uri, ActiveFile.data.uri)) {
        return;
    }

    setExtensionState(ExtensionState.waiting);

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

    // Step 4: If there are build files left, removed those dependencies from the target BUILD.bazel
    try {
        const didUpdate = await updateBuildDeps({
            'removeDeps': targetDepsToRemove,
            'fileUri': changeEvent.document.uri,
            'buildTarget': changedFile.target
        });
        if (didUpdate) {
            showDismissableFileMessage(`Bazel deps removed from ${BUILD_FILE}`, changedFile.buildUri);
        } else {
            showDismissableMessage("Bazel deps not removed (dependency still exists)");
        }
    } catch (error) {
        handleBuildozerError({ 
            error, 
            msgSuccess: "No deps removed", 
            msgFail: "Failed to remove deps", 
            uri: changedFile.buildUri
        });
    }    
}

function validateDeletions(remainingDependencies: string[], deletedImports: Set<string>): string[] {
    for (const target of remainingDependencies) {
        if (deletedImports.delete(target)) {
            console.debug(`${target} dep still exists\n`);
        } 
        if (deletedImports.size === 0) {
            break; 
        }
    }
    return Array.from(deletedImports);
}