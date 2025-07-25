import * as vscode from 'vscode';

const TARGET_PREFIXES = vscode.workspace.getConfiguration('bazel-import').targetPrefixes;

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
