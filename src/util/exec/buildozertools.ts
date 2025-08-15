import * as path from 'path';
import * as vscode from 'vscode';
import { showDismissableFileMessage, showDismissableMessage, showErrorMessage } from '../../ui/userinteraction';
import { executeCommand } from './exectools';
import { isRejection } from './error';

export function handleBuildozerError(
    { error, msgSuccess = "Dependencies already up to date", msgFail = "Failed to analyze dependencies", uri = undefined
    }: { error: unknown; msgSuccess?: string; msgFail?: string; uri?: vscode.Uri; }) {
    if (isRejection(error) && error.error.code === 3) { // Per buildozer docs an exit code of 3 means success with no change
        if (uri) {
            showDismissableFileMessage(msgSuccess, uri);
        }
        else {
            showDismissableMessage(msgSuccess);
        }
    }
    else if (uri) {
        showErrorMessage(msgFail, uri);
        console.error(error);
    }
    else {
        showErrorMessage(msgFail);
        console.error(error);
    }
}

export async function updateBuildDeps(
    { addDeps = [], removeDeps = [], buildTarget, fileUri }: { addDeps?: string[]; removeDeps?: string[]; buildTarget: string; fileUri: vscode.Uri; }) {
    const add = addDeps.join(' ').trim();
    const remove = removeDeps.join(' ').trim();
    const buildozerRemove = remove.length > 0 ? `buildozer "remove deps ${remove}" "${buildTarget}"; ` : "";
    const buildozerAdd = add.length > 0 ? `buildozer "add deps ${add}" "${buildTarget}"` : "";
    const buildozer = buildozerRemove.concat(buildozerAdd);

    if (buildozer) {
        console.log(`Executing command: ${buildozer}`);
        await executeCommand(buildozer, path.dirname(fileUri.fsPath));
        return true;
    }
    return false;
}
