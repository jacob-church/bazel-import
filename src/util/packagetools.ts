import * as vscode from 'vscode';
import {uriToContainingUri} from './uritools';
import {filePathToTargetPath} from './targettools';
import {ActiveFile} from '../model/activeFile';
import {MAX_PKG_SIZE} from '../userinteraction';
import {getFullPathsFromFile} from './filetools';

const BUILD_FILE_NAME = vscode.workspace.getConfiguration('bazel-import').buildFile;

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

/**
 * @deprecated Gets package sources (i.e., under same build file), but not target sources
 */
export async function getPackageSourceUris(uri: vscode.Uri): Promise<[vscode.Uri[], string, vscode.Uri] | undefined> {
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

export async function getImportPathsFromPackage(packageSources: vscode.Uri[]) {
    return (await Promise.all(packageSources.map(async uri => getFullPathsFromFile(uri!)))).flat();
} 

export function packageTooLarge(): boolean {
    return (ActiveFile.data.packageSources.length ?? MAX_PKG_SIZE + 1) > MAX_PKG_SIZE;
}