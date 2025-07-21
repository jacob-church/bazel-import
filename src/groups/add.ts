import * as vscode from 'vscode';
import {showDismissableFileMessage} from '../userinteraction';
import * as path from 'path';
import {executeCommand, handleBuildozerError} from '../util/exectools';
import {ActiveFileData} from '../model/activeFile';
import {uriToBuild} from '../util/filepathtools';
import {getBuildTargetsFromAdditions} from '../util/eventtools';
import {BUILD_FILE} from '../extension';

// ADDITION
export async function addDeps(changeEvent: vscode.TextDocumentChangeEvent, changedFile: ActiveFileData | undefined) {
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
    } catch (error) {
        handleBuildozerError({
            error,
            msgSuccess: `Nothing added to ${BUILD_FILE}`,
            msgFail: `Command failed: Something might be wrong with ${BUILD_FILE}`, 
            uri: buildFileUri
        });
    }
}