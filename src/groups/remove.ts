import * as vscode from 'vscode';
import {showDismissableFileMessage, showDismissableMessage, showErrorMessage} from '../ui/userinteraction';
import {ActiveFile, ActiveFileData} from '../model/activeFile';
import {getDeletedImportPaths} from '../util/filetext/eventtools';
import {ExtensionState, setExtensionState} from '../extension';
import { BUILD_FILE } from '../config/config';
import { getImportPathsFromPackage } from '../util/path/packagetools';
import { uriEquals } from '../util/path/uritools';
import { updateBuildDeps, handleBuildozerError } from '../util/exec/buildozertools';
import { streamTargetInfosFromFilePaths } from '../util/exec/bazeltools';
import { pathsToTargets } from '../util/path/filepathtools';

// DELETION
export async function removeDeps(changeEvent: vscode.TextDocumentChangeEvent, changedFile: ActiveFileData) {
    if (!uriEquals(changeEvent.document.uri, ActiveFile.data.uri)) {
        return;
    }

    setExtensionState(ExtensionState.waiting);

    // Find the file paths for deleted imports
    const [deletedImports, deletedExternal] = getDeletedImportPaths(changedFile.documentState, changeEvent);
    if (deletedImports.length === 0 && deletedExternal.length === 0) {
        return;
    }

    const [remainingImports, remainingExternal] = await getImportPathsFromPackage(changedFile.packageSources);

    const context = await streamTargetInfosFromFilePaths(Array.from(new Set(deletedImports.concat(remainingImports))));
    if (context.empty()) {
        showErrorMessage("Failed to load context");
        return;
    }

    const deletionTargets = pathsToTargets(deletedImports, context);
    deletedExternal.forEach(t => deletionTargets.add(t));

    const remainingTargets = pathsToTargets(remainingImports, context);
    remainingExternal.forEach(t => remainingTargets.add(t));
    
    const targetDepsToRemove = setSubtract(remainingTargets, deletionTargets);
    console.debug('Removing deps', targetDepsToRemove);

    // Step 4: If there are build files left, removed those dependencies from the target BUILD.bazel
    try {
        const didUpdate = await updateBuildDeps({
            removeDeps: Array.from(targetDepsToRemove),
            fileUri: changeEvent.document.uri,
            buildTarget: changedFile.target
        });
        if (didUpdate) {
            showDismissableFileMessage(`${targetDepsToRemove.size} dep(s) removed from ${BUILD_FILE}`, changedFile.buildUri);
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
    setExtensionState(ExtensionState.ready);   
}

/**
 * Subtracts items from a set
 */
function setSubtract(subtractions: Iterable<string>, contentSet: Set<string>): Set<string> {
    for (const imp of subtractions) {
        if (contentSet.delete(imp)) {
            console.debug(`${imp} removed from set\n`);
        } 
        if (contentSet.size === 0) {
            break; 
        }
    }
    return contentSet;
}