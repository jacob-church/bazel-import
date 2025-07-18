import { exec, ExecException } from 'child_process';
import * as vscode from 'vscode';
import {showDismissableFileMessage, showDismissableMessage, showErrorMessage} from '../userinteraction';

export async function getBazelDeps(target: string, cwd: string, excludedTargets?: string[]): Promise<string> {
    let command = `bazel query "labels(deps, ${target})"`;

    if (excludedTargets && excludedTargets.length > 0) {
        const excludePart = excludedTargets.map(path => `except ${path}/...`).join(' ');
        const excludeCommand = `${command} ${excludePart}`;
        try {
            return await executeCommand(excludeCommand, cwd);
        }
        catch (error) {
            console.error("Error in except command, retrying without it");
        }
    }

    console.debug(`Executing ${command} in ${cwd}`);

    return await executeCommand(command, cwd);
}

export async function executeCommand(command: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(command, {cwd: cwd}, (error, stdout, stderr) => {
            if (error) {
                return reject({
                    "error": error,
                    "stderr": stderr
                });
            }
            if (stderr) {
                console.debug(`stderr: ${stderr}`);
            }
            resolve(stdout);
        });
    });
}

export function handleBuildozerError(
{ error, 
    msgSuccess = "Dependencies already up to date", 
    msgFail = "Failed to analyze dependencies", 
    uri = undefined 
}: { error: unknown; msgSuccess?: string; msgFail?: string; uri?: vscode.Uri }) {
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

type Rejection = {
    error: ExecException,
    stderr: string
};

function isRejection(error: unknown): error is Rejection {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    'stderr' in error &&
    typeof (error as Rejection).stderr === 'string'
  );
}
