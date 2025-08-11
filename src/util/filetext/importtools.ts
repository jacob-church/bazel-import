import * as vscode from 'vscode';
import { importToFs } from '../path/filepathtools';
import { getConfig } from '../../config/config';

const EXTERNAL_TARGETS = getConfig("externalTargets");

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

export function getFullImportPathsFromTextAndFile(text: string, fileUri: vscode.Uri): [string[], string[]] {
    const importMatches = getImportsFromText(text);
    const [importUris, externalTargets] = getFullPathFromImports(importMatches, fileUri);
    return [importUris, externalTargets];
}

function getImportsFromText(fileText: string): RegExpMatchArray[] {
    const query = new RegExp("from \'.*\';", "gi");
    return Array.from(fileText.matchAll(query));
};

function getFullPathFromImports(importMatches: RegExpMatchArray[], fileUri: vscode.Uri): [string[], string[]] {
    const paths: string[] = [];
    const externalTargets: string[] = [];
    for (const match of importMatches) {
        const filePath = matchToPath(match);
        const externalTarget = filterExternalTargets(filePath);
        if (externalTarget !== undefined) {
            externalTargets.push(externalTarget); 
            continue;
        }
        try {
            const importUri = importToFs(fileUri, filePath);
            if (importUri !== undefined) {
                paths.push(importUri.replace('bazel-out/k8-fastbuild/bin/', '')); // TODO: fixme
            }
        }
        catch (error) {
            console.debug(`Build target not found ${filePath}`);
            console.error(error);
        }
    }
    return [paths, externalTargets];
};

function matchToPath(match: RegExpMatchArray) {
    const searchString = "from \'";
    const filePathIndex = match[0].indexOf(searchString) + searchString.length;
    const filePath = match[0].slice(filePathIndex, match[0].length - 2);
    return filePath;
}

function filterExternalTargets(filePath: string) {
    for (const externalTarget of Object.keys(EXTERNAL_TARGETS)) {
        if (filePath.startsWith(externalTarget)) {
            return EXTERNAL_TARGETS[externalTarget]; 
        }
    }
    return undefined; 
}