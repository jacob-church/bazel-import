import * as vscode from 'vscode';
import { importToFs } from '../path/filepathtools';
import { getConfig } from '../../config/config';

const IMPORT_REPLACEMENTS = getConfig("importPathReplacements");

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
    const query = /(from '.*'| require\('.*'\))/g;
    return Array.from(fileText.matchAll(query));
};

function getFullPathFromImports(importMatches: RegExpMatchArray[], fileUri: vscode.Uri): [string[], string[]] {
    const paths: string[] = [];
    const externalTargets: string[] = [];
    for (const match of importMatches) {
        const filePath = matchToPath(match);
        try {
            const importPathOrTarget = importToFs(fileUri, filePath);
            if (importPathOrTarget === undefined) {
                continue;
            }
            if (importPathOrTarget.path !== undefined) {
                paths.push(importPathReplace(importPathOrTarget.path));
            }
            if (importPathOrTarget.externalTarget !== undefined) {
                externalTargets.push(importPathOrTarget.externalTarget);
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
    const startIndex = match[0].indexOf(searchString);
    if (startIndex >= 0) {
        const filePathIndex = startIndex + searchString.length;
        const filePath = match[0].slice(filePathIndex, match[0].length - 1);
        return filePath;
    }
    const searchRequire = " require(\'";
    const startRequire = match[0].indexOf(searchRequire);
    const filePathIndex = startRequire + searchRequire.length;
    const filePath = match[0].slice(filePathIndex, match[0].length - 2);
    return filePath;
}

function importPathReplace(importPath: string) {
    for (const find of Object.keys(IMPORT_REPLACEMENTS)) {
        if (importPath.includes(find)) {
            return importPath.replace(find, IMPORT_REPLACEMENTS[find]);
        }
    }
    return importPath; 
}