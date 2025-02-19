import * as vscode from 'vscode';
import {uriToContainingUri} from './uritools';

const BUILD_FILE_NAME = vscode.workspace.getConfiguration('bazel-import').buildFile;
const TARGET_PREFIXES = vscode.workspace.getConfiguration('bazel-import').targetPrefixes;
/**
 * Recursively search up the file tree to the nearest BUILD.bazel file
 * and return the build target path
 */
export async function uriToBuildTarget(uri: vscode.Uri): Promise<[string, vscode.Uri] | undefined> {
    let currentUri = uri;
    while (currentUri.fsPath !== '/') {
        const files = await vscode.workspace.fs.readDirectory(currentUri);
        if (files.some(([name]) => name === BUILD_FILE_NAME)) {
            const targetPath = filePathToTargetPath(currentUri.fsPath);
            const buildUri = vscode.Uri.joinPath(currentUri, BUILD_FILE_NAME);
            if (targetPath) {
                return [targetPath, buildUri];
            }
            return undefined;
        }
        currentUri = uriToContainingUri(currentUri);
    }
}

/**
 * @param path e.g. /home/<dev>/lucid/main/<target-prefix>/blah/blah/blah
 *      <target-prefix> values can be defined in bazel-import.targetPrefixes
 * @returns e.g. //<target-prefix>/blah/blah/blah
 */
export function filePathToTargetPath(path: string): string | undefined {
    let index = -1;
    if (typeof TARGET_PREFIXES === 'string') {
        index = path.indexOf(TARGET_PREFIXES);
    } else if (TARGET_PREFIXES !== null) {
        for (let i = 0; i < TARGET_PREFIXES.length; i++) {
            const newIndex = path.indexOf(TARGET_PREFIXES[i]);
            if (newIndex !== -1) {
                index = newIndex;
                break;
            }
        }
    }
    if (index === -1) {
        return undefined;
    }
    return `/${path.substring(index)}`;
}
