import * as vscode from 'vscode';
import {showDismissableFileMessage, showDismissableMessage, showErrorMessage} from '../userinteraction';
import {ActiveFile, ActiveFileData} from '../model/activeFile';
import {getDeletedImportPaths} from '../util/eventtools';
import {ExtensionState, setExtensionState} from '../extension';
import { BUILD_FILE } from '../config/config';
import { getImportPathsFromPackage } from '../util/packagetools';
import { uriEquals } from '../util/uritools';
import { updateBuildDeps, handleBuildozerError } from '../util/exectools';
import { fsToWsPath } from '../util/filepathtools';
import { streamTargetInfosFromFilePaths } from '../util/bazeltools';
import { TargetInfo } from '../model/bazelquery/targetinfo';
import { FilesContext } from '../model/bazelquery/filescontext';

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

    // Evaluate remaining imports to see if they depend on any of the build files from the deleted imports //TODO Factor this out
    
    const targetDepsToRemove = validateDeletions(remainingTargets, deletionTargets);
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

// TODO: move this
export function pathsToTargets(importPaths: string[], context: FilesContext<string,string,TargetInfo>): Set<string> {
    const targets = new Set<string>();
    for (const importPath of importPaths) {
        const wsPath = fsToWsPath(importPath);
        const target = context.getTarget(wsPath);
        if (target !== undefined) {
            targets.add(target);
        }
    }
    return targets;
}

function validateDeletions(remainingImports: Iterable<string>, deletedImports: Set<string>): Set<string> {
    for (const imp of remainingImports) {
        if (deletedImports.delete(imp)) {
            console.debug(`${imp} dep still exists\n`);
        } 
        if (deletedImports.size === 0) {
            break; 
        }
    }
    return deletedImports;
}