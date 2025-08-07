import * as vscode from 'vscode';
import {showDismissableFileMessage} from '../userinteraction';
import {handleBuildozerError, updateBuildDeps} from '../util/exectools';
import {ActiveFileData} from '../model/activeFile';
import {uriToBuild} from '../util/filepathtools';
import {getAddedImportPaths} from '../util/eventtools';
import {BUILD_FILE} from '../extension';
import { uriEquals } from '../util/uritools';
import { getTargetsFromFilePaths } from '../util/bazeltools';

// ADDITION
export async function addDeps(changeEvent: vscode.TextDocumentChangeEvent, changedFile: ActiveFileData | undefined) {    
    let buildFileUri: vscode.Uri | undefined; // let's assert that the changeEvent matches the currently open text editor; that will filter out changes that come from other sources
    
    // Step 1: Determine the current build target (e.g. where are we adding new dependencies to?)
    let currentTargetPair: [string, vscode.Uri] | undefined;
    if (changedFile && uriEquals(changeEvent.document.uri, changedFile.uri)) {
        currentTargetPair = [changedFile.target, changedFile.buildUri]; // This should be accurate though
    } else {
        currentTargetPair = uriToBuild(changeEvent.document.uri);
    }
    if (currentTargetPair === undefined) {
        return;
    }
    
    const currentTarget = currentTargetPair[0];
    buildFileUri = currentTargetPair[1];

    // Step 2: Get the build targets from the added imports
    const addedImports = getAddedImportPaths(changeEvent); 
    if (addedImports.length === 0) {
        return;
    }
    console.debug("Added Targets", addedImports);

    // TODO: consider adding self package to improve accuracy of adds (i.e., get current deps);
    // TODO: Probably do this bc it currently adds to the build file default (i.e., pkgname:pkgname) [if deletions are]
    const targets = await getTargetsFromFilePaths(addedImports);

    if (targets.length === 0) {
        return;
    }

    // Step 3: Do the update
    try {
        const didUpdate = await updateBuildDeps({
            addDeps: targets,
            buildTarget: currentTarget,
            fileUri: changeEvent.document.uri
        });
        if (didUpdate) {
            showDismissableFileMessage(`Attempted to add ${targets.length} dep(s) to ${BUILD_FILE}. One or more targets added successfully.`, buildFileUri);
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