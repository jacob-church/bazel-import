import * as vscode from 'vscode';
import {showDismissableFileMessage, showErrorMessage} from '../ui/userinteraction';
import { handleBuildozerError, updateBuildDeps } from '../util/exec/buildozertools';
import {ActiveFileData} from '../model/activeFile';
import {fsToWsPath} from '../util/path/filepathtools';
import { uriToBuild } from '../util/path/uritools';
import {getAddedImportPaths} from '../util/filetext/eventtools';
import { BUILD_FILE } from '../config/config';
import { uriEquals } from '../util/path/uritools';
import { streamTargetInfosFromFilePaths } from '../util/exec/bazeltools';
import { pathsToTargets } from '../util/path/filepathtools';

// ADDITION
export async function addDeps(changeEvent: vscode.TextDocumentChangeEvent, changedFile: ActiveFileData | undefined) {    
    // Step 1: Determine the current build target (e.g. where are we adding new dependencies to?)
    const buildUri = (changedFile && uriEquals(changeEvent.document.uri, changedFile.uri)) ? changedFile.buildUri : uriToBuild(changeEvent.document.uri);

    if (buildUri === undefined) {
        return;
    }

    // Step 2: Get the build targets from the added imports
    const [addedImports, externalTargets] = getAddedImportPaths(changeEvent); 
    if (addedImports.length === 0 && externalTargets.length === 0) {
        return;
    }
    
    const filePath = changeEvent.document.uri.fsPath;
    const context = await streamTargetInfosFromFilePaths(Array.from(new Set(addedImports.concat(filePath))));
    
    const targets = pathsToTargets(addedImports, context);
    externalTargets.forEach(t => targets.add(t));
    
    console.debug("Added Targets", targets);

    if (targets.size === 0) {
        return;
    }
    const wsPath = fsToWsPath(filePath);
    const currentTarget = context.getTarget(wsPath); 
    if (currentTarget === undefined) {
        showErrorMessage(`Failed to find target for ${wsPath}`);
        return;
    }
    targets.delete(currentTarget); // No adding self dependencies

    // Step 3: Do the update
    try {
        const didUpdate = await updateBuildDeps({
            addDeps: Array.from(targets),
            buildTarget: currentTarget,
            fileUri: changeEvent.document.uri
        });
        if (didUpdate) {
            showDismissableFileMessage(`Attempted to add ${targets.size} dep(s) to ${BUILD_FILE}. One or more targets added successfully.`, buildUri);
        }
    } catch (error) {
        handleBuildozerError({
            error,
            msgSuccess: `Nothing added to ${BUILD_FILE}`,
            msgFail: `Command failed: Something might be wrong with ${BUILD_FILE}`, 
            uri: buildUri
        });
    }
}