import { exec, ExecException } from 'child_process';
import * as vscode from 'vscode';
import {showDismissableFileMessage, showDismissableMessage, showErrorMessage} from '../userinteraction';
import * as path from 'path';
import { getRoot } from './filepathtools';

export async function getBazelDeps(target: string, cwd: string, excludedTargets?: string[]): Promise<string> {
    const command = `bazel query "labels(deps, ${target})"`;

    if (excludedTargets && excludedTargets.length > 0) {
        const excludePart = excludedTargets.map(path => `except ${path}/...`).join(' ');
        const excludeCommand = `${command} ${excludePart}`;
        console.debug("Command with excludes", excludeCommand);
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

export async function executeCommand(command: string, cwd?: string): Promise<string> {
    const options = cwd ? {cwd: cwd} : {};
    return new Promise((resolve, reject) => {
        exec(command, options, (error, stdout, stderr) => {
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

/**
 * Attempts to shut down Bazel, first gracefully, then forcefully if necessary.
 * @param {number} timeoutMs - The time to wait for a graceful shutdown before forcing it.
 */
export async function shutdownBazelHard(timeoutMs = 2000) {
    try {
        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Graceful shutdown timed out')), timeoutMs)
        );

        // Race the shutdown command against the timeout
        await Promise.race([
            executeCommand('bazel shutdown', getRoot()),
            timeoutPromise
        ]);

        return;

    } catch (error) {
        console.warn(`Graceful shutdown failed: ${error}. Attempting forceful kill.`);

        try {
            const pid = await executeCommand('bazel info server_pid', getRoot());
            if (pid && pid.trim()) {
                await executeCommand(`kill -9 ${pid.trim()}`);
                console.debug(`Successfully killed Bazel server with PID: ${pid.trim()}`);
            } else {
                console.debug('Bazel server process not found.');
            }
        } catch (killError) {
            console.error(`Failed to forcefully kill Bazel: ${killError}`);
            throw killError;
        }
    }
}