import * as vscode from 'vscode';
import { importToFullPath } from './filepathtools';


const EXTERNAL_TARGETS = vscode.workspace.getConfiguration('bazel-import').externalTargets;

/**
 * Gets the full paths of a file's imports
 * @param fileUri the file to examine
 * @returns the file path of the file's imports
*/
export async function getFullPathsFromFile(fileUri: vscode.Uri) {
    const file = await vscode.workspace.openTextDocument(fileUri); 
    const fileText = file!.getText(); 
    
    const filePaths = getFullImportPathsFromTextAndFile(fileText, fileUri);
    return filePaths;
};

export function getFullImportPathsFromTextAndFile(text: string, fileUri: vscode.Uri) {
    const importMatches = getImportsFromText(text);
    const importUris = getFullPathFromImports(importMatches, fileUri);
    return importUris;
}

function getImportsFromText(fileText: string): RegExpMatchArray[] {
    const query = new RegExp("from \'.*\';", "gi");
    return Array.from(fileText.matchAll(query));
};

function getFullPathFromImports(importMatches: RegExpMatchArray[], fileUri: vscode.Uri): string[] {
    const paths: string[] = [];
    for (const match of importMatches) {
        const filePath = matchToPath(match);
        try {
            const importUri = importToFullPath(fileUri, filePath);
            if (importUri !== undefined) {
                paths.push(importUri.replace('bazel-out/k8-fastbuild/bin/', ''));
            }
        }
        catch (error) {
            console.debug(`Build target not found ${filePath}`);
            console.error(error);
        }
    }
    return paths;
};

function matchToPath(match: RegExpMatchArray) {
    const searchString = "from \'";
    const filePathIndex = match[0].indexOf(searchString) + searchString.length;
    const filePath = match[0].slice(filePathIndex, match[0].length - 2);
    return filePath;
}

