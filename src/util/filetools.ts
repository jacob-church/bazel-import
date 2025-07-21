import * as vscode from 'vscode';
import { getBuildTargetFromFilePath } from './filepathtools';


const EXTERNAL_TARGETS = vscode.workspace.getConfiguration('bazel-import').externalTargets;

/**
 * Gets the build dependencies of a file defined by a vscode.Uri
 * @param fileUri the file to examine
 * @returns the build targets of the file's dependencies
*/
export async function getBuildTargetsFromFile(fileUri: vscode.Uri) {
    const file = await vscode.workspace.openTextDocument(fileUri); 
    const fileText = file!.getText(); 
    
    const targets = getTargetsFromTextAndFile(fileText, fileUri);
    return targets;
};

export function getTargetsFromTextAndFile(text: string, fileUri: vscode.Uri) {
    const importMatches = getImportsFromText(text);
    const targets = getTargetsFromImports(importMatches, fileUri);
    return targets;
}

function getImportsFromText(fileText: string): RegExpMatchArray[] {
    const query = new RegExp("from \'.*\';", "gi");
    return Array.from(fileText.matchAll(query));
};

function getTargetsFromImports(importMatches: RegExpMatchArray[], fileUri: vscode.Uri): string[] {
    const targets: string[] = [];
    for (const match of importMatches) {
        let isExternalTarget = false;
        for (const [key, value] of Object.entries(EXTERNAL_TARGETS)) {
            if (match[0].includes(key)) {
                targets.push(value as string);
                isExternalTarget = true;
                break;
            }
        }
        if (isExternalTarget) {
            continue;
        }

        const searchString = "from \'";
        const filePathIndex = match[0].indexOf(searchString) + searchString.length; 
        const filePath = match[0].slice(filePathIndex, match[0].length - 2);
        try {
            const [buildTarget,] = getBuildTargetFromFilePath(filePath, fileUri) ?? [undefined, undefined];
            if (buildTarget !== undefined) {
                targets.push(buildTarget);
            }
        }
        catch (error) {
            console.debug(`Build target not found ${filePath}`);
            console.error(error);
        }
    }
    return targets;
};

