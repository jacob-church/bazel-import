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
 * Recursively search down the file tree until a package (i.e., BUILD.bazel file)
 * or leaf is reached and return the source files in the subdirectories.
 * 
 * In other words, get the source files for subdirectories of a bazel target.
 */
async function getSubDirectorySources(uri: vscode.Uri): Promise<vscode.Uri[]> {
    let subTargets = new Array(); 
    let currentUri = uri; 
    const files = await vscode.workspace.fs.readDirectory(currentUri);
    
    // Check for build file first so that it returns nothing from a different package
    if (files.some(([name]) => name === BUILD_FILE_NAME)) {
        return subTargets; 
    }

    for (const file of files) {
        const [name, type] = file;
        const fileURI = vscode.Uri.joinPath(currentUri, name);  
        if (type === vscode.FileType.File) {
            subTargets.push(fileURI);
        }
        else if (type === vscode.FileType.Directory) {
            subTargets.push(...await getSubDirectorySources(fileURI));
        }
    }
    return subTargets; 
}

export async function packageSourceUris(uri: vscode.Uri): Promise<[vscode.Uri[], string, vscode.Uri] | undefined> {
    let currentUri = uri; 
    const targetUris: vscode.Uri[] = new Array(); 
    let targetPath; let buildUri; 
    const subdirectories = new Set<string>();
    while (currentUri.fsPath !== '/') {
        const files = await vscode.workspace.fs.readDirectory(currentUri);
        let buildFound = false; 
        for (const file of files) {
            const [name, type] = file; 
            if (type === vscode.FileType.Directory) {
                const subdirectoryUri = vscode.Uri.joinPath(currentUri, name);
                if (!subdirectories.has(subdirectoryUri.toString())) {
                    targetUris.push(...await getSubDirectorySources(subdirectoryUri));
                } 
            }
            if (type !== vscode.FileType.File) {
                continue;
            }
            if (name === BUILD_FILE_NAME) {
                targetPath = filePathToTargetPath(currentUri.fsPath);
                buildUri = vscode.Uri.joinPath(currentUri, BUILD_FILE_NAME);
                if (!targetPath) {
                    return undefined; 
                }
                buildFound = true; 
            }
            else {
                targetUris.push(vscode.Uri.joinPath(currentUri, name));
            }
        }
        if (buildFound) {
            return [targetUris, targetPath as string, buildUri as vscode.Uri];  
        }
        subdirectories.add(currentUri.toString());
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
