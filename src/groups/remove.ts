import * as vscode from 'vscode';
import {getBuildTargetsFromFile} from '../util/filetools';
import {showDismissableFileMessage, showDismissableMessage} from '../userinteraction';
import * as path from 'path';
import {executeCommand, handleBuildozerError} from '../util/exectools';
import {ActiveFileData} from '../model/activeFile';
import {getBuildTargetsFromDeletions} from '../util/eventtools';
import {BUILD_FILE, ExtensionState, extensionState, setExtensionState} from '../extension';
import { getBuildTargetsFromPackage } from '../util/packagetools';

// DELETION
export async function removeDeps(changeEvent: vscode.TextDocumentChangeEvent, changedFile: ActiveFileData | undefined) {
    if (changedFile === undefined) {
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

    // No build files left - Return
    if (targetDepsToRemove.trim().length === 0) {
        showDismissableMessage("Bazel deps not removed (dependency still exists)");
        return; 
    }

    // Step 4: If there are build files left, removed those dependencies from the target BUILD.bazel
    try {
        const buildozer = `buildozer "remove deps ${targetDepsToRemove}" "${changedFile.target}"`;
        console.log(`Executing: ${buildozer}`);
        await executeCommand(buildozer, path.dirname(changedFile.uri.fsPath));
        showDismissableFileMessage(`Bazel deps removed from ${BUILD_FILE}`, changedFile.buildUri);
    } catch (error) {
        handleBuildozerError({ 
            error, 
            msgSuccess: "No deps removed", 
            msgFail: "Failed to remove deps", 
            uri: changedFile.buildUri
        });
    }    
}

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