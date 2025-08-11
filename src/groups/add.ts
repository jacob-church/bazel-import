import * as vscode from 'vscode';
import {showDismissableFileMessage, showErrorMessage} from '../userinteraction';
import {handleBuildozerError, updateBuildDeps} from '../util/exectools';
import {ActiveFileData} from '../model/activeFile';
import {fsToWsPath, uriToBuild} from '../util/filepathtools';
import {getAddedImportPaths} from '../util/eventtools';
import { BUILD_FILE } from '../config/config';
import { uriEquals } from '../util/uritools';
import { streamTargetInfosFromFilePaths } from '../util/bazeltools';
import { pathsToTargets } from './remove';

// ADDITION
export async function addDeps(changeEvent: vscode.TextDocumentChangeEvent, changedFile: ActiveFileData | undefined) {    
    let buildFileUri: vscode.Uri | undefined; // let's assert that the changeEvent matches the currently open text editor; that will filter out changes that come from other sources
    
    // Step 1: Determine the current build target (e.g. where are we adding new dependencies to?)
    let buildUri: vscode.Uri | undefined;
    if (changedFile && uriEquals(changeEvent.document.uri, changedFile.uri)) {
        buildUri = changedFile.buildUri; // This should be accurate though
    } else {
        buildUri = uriToBuild(changeEvent.document.uri)?.[1] ?? undefined;
    }
    if (buildUri === undefined) {
        return;
    }

    // Step 2: Get the build targets from the added imports
    const addedImports = getAddedImportPaths(changeEvent); 
    if (addedImports.length === 0) {
        return;
    }
    console.debug("Added Targets", addedImports);

    const filePath = changeEvent.document.uri.fsPath;
    const context = await streamTargetInfosFromFilePaths(addedImports.concat(filePath));
    
    const targets = pathsToTargets(addedImports, context);

    if (targets.size === 0) {
        return;
    }
    const wsPath = fsToWsPath(filePath);
    const currentTarget = context.getTarget(wsPath); 
    if (currentTarget === undefined) {
        showErrorMessage(`Failed to find target for ${wsPath}`);
        return;
    }

    // Step 3: Do the update
    try {
        const didUpdate = await updateBuildDeps({
            addDeps: Array.from(targets),
            buildTarget: currentTarget,
            fileUri: changeEvent.document.uri
        });
        if (didUpdate) {
            showDismissableFileMessage(`Attempted to add ${targets.size} dep(s) to ${BUILD_FILE}. One or more targets added successfully.`, buildFileUri);
        }
    } catch (error) {
        handleBuildozerError({
            error,
            msgSuccess: `Nothing added to ${BUILD_FILE}`,
            msgFail: `Command failed: Something might be wrong with ${BUILD_FILE}`, 
            uri: buildFileUri
        });
    }
}