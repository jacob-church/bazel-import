import * as vscode from 'vscode';
import {uriToContainingUri} from './uritools';
/**
 * Recursively search up the file tree to the nearest BUILD.bazel file
 * and return the build target path
 */
export async function uriToBuildTarget(uri: vscode.Uri): Promise<[string, vscode.Uri] | undefined> {
    const files = await vscode.workspace.fs.readDirectory(uri);
    const buildFileName = vscode.workspace.getConfiguration('bazel-import').buildFile;
    if (files.some(([name]) => name === buildFileName)) {
        const targetPath = filePathToTargetPath(uri.fsPath);
        const buildUri = vscode.Uri.joinPath(uri, buildFileName);
        if (targetPath) {
            return [targetPath, buildUri];
        }
        return undefined;
    }
    return uriToBuildTarget(uriToContainingUri(uri));
}

/**
 * @param path e.g. /home/<dev>/lucid/main/<target-prefix>/blah/blah/blah
 *      <target-prefix> values can be defined in bazel-import.targetPrefixes
 * @returns e.g. //<target-prefix>/blah/blah/blah
 */
export function filePathToTargetPath(path: string): string | undefined {
    const targetPrefixes = vscode.workspace.getConfiguration('bazel-import').targetPrefixes;
    let index = -1;
    if (typeof targetPrefixes === 'string') {
        index = path.indexOf(targetPrefixes);
    } else if (targetPrefixes !== null) {
        for (let i = 0; i < targetPrefixes.length; i++) {
            const newIndex = path.indexOf(targetPrefixes[i]);
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
