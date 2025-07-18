import * as vscode from 'vscode';
import { urisFromTextChanges } from '../importparse';
import { uriToBuild, resolveSpecifierToUri } from './filepathtools';
import * as path from 'path';


const EXTERNAL_TARGETS = vscode.workspace.getConfiguration('bazel-import').externalTargets;
const MIN_LENGTH = 7; // Minimum length of a ts import "from ''"

const isChangeDelete = (change: vscode.TextDocumentContentChangeEvent): boolean => {
    return change.text === '' && change.rangeLength > MIN_LENGTH;
};


export function getDeletedImports(text: string, event: vscode.TextDocumentChangeEvent) {
    return getImportsFromTextAndChangeEvent(text, event, isChangeDelete);
}


export function getImportsFromChangeEvent(event: vscode.TextDocumentChangeEvent) {
    const changes = event.contentChanges;

    const importBuildTargets: Set<string> = new Set<string>();

    for (const change of changes) {
        if (change.text.length <= MIN_LENGTH && change.rangeLength <= MIN_LENGTH) {
            continue;
        }

        const matches = getImportsFromText(change.text);
        const importTargets = filterImports(matches, event.document.uri);
        for (const target of importTargets) {
            importBuildTargets.add(target);
        }
    }
    return importBuildTargets;
}


export const getImportsFromTextAndChangeEvent = (text: string, event: vscode.TextDocumentChangeEvent, validateChange: (change: vscode.TextDocumentContentChangeEvent) => boolean) => {
    const changes: readonly vscode.TextDocumentContentChangeEvent[] = event.contentChanges; 
    const splitter = '\n';

    const importDeletions: string[] = new Array(); 
    for (let change of changes) {

        if (!validateChange(change)) {
            continue;
        }
        const startIndex = event.document.offsetAt(change.range.start);
        const endIndex = Math.max(event.document.offsetAt(change.range.end), startIndex + change.rangeLength);

        // TODO: switch to regex?
        const deletion = text.substring(startIndex, endIndex);
        const deletedTexts = deletion.split(splitter);
        
        for (const deletedText of deletedTexts) {
            const searchString = "from \'";
            const filePathIndex = deletedText.indexOf(searchString) + searchString.length; 
            if (filePathIndex >= searchString.length) {
                importDeletions.push(deletedText.slice(filePathIndex, deletedText.length - 2)); 
            }
            else {
                console.log(`Deletion not an import:\n${deletedText}`);
            }
        }
    }
    return importDeletions; 
};

// TODO MOVE
export const getBuildTargetFromFilePath = (importPath: string, currentFile: vscode.Uri): [string, vscode.Uri] => {
    let fileUri: vscode.Uri | undefined;
    if (importPath.startsWith('.')) {
        importPath = path.resolve(path.dirname(currentFile.fsPath), importPath) + ".ts";
        fileUri = vscode.Uri.file(importPath); 
    }
    else {
        fileUri = resolveSpecifierToUri(currentFile, importPath);
    }

    if (!fileUri) {
        throw new Error("Unexpected lack of uri"); 
    }
    const target = uriToBuild(fileUri);
    if (!target) {
        throw new Error("Unexpected undefined target");
    }
    return target;
};

// TODO MOVE RENAME
const getImportsFromText = (fileText: string): RegExpMatchArray[] => {
    const query = new RegExp("from \'.*\';", "gi");

    return Array.from(fileText.matchAll(query));
};


// TODO MOVE
/**
 * Gets the build dependencies of a file defined by a vscode.Uri
 * @param fileUri the file to examine
 * @returns the build targets of the file's dependencies
*/
export const getBuildTargetsFromFile = async (fileUri: vscode.Uri) => {
    if (fileUri.fsPath.includes("luciddocument.ts")) {
        console.error("We did it");
        console.log("import {DocumentStatusCalculatorPipe} from './astevaluator/formula/pipes/documentstatuscalculatorpipe';");
    }
    const file = await vscode.workspace.openTextDocument(fileUri); 
    const fileText = file!.getText(); 
    
    const importMatches = getImportsFromText(fileText); 
    const targets = filterImports(importMatches, fileUri);
    
    return targets;
};

// TODO MOVE RENAME
const filterImports = (importMatches: RegExpMatchArray[], fileUri: vscode.Uri): string[] => {
    const targets: string[] = [];
    for (const match of importMatches) {
        let shouldContinue = false;
        for (const [key, value] of Object.entries(EXTERNAL_TARGETS)) {
            if (match[0].includes(key)) {
                targets.push(value as string);
                shouldContinue = true;
                break;
            }
        }
        if (shouldContinue) {
            continue;
        }
        else {
            const searchString = "from \'";
            const filePathIndex = match[0].indexOf(searchString) + searchString.length; 
            const filePath = match[0].slice(filePathIndex, match[0].length - 2);
            try {
                const [buildTarget,] = getBuildTargetFromFilePath(filePath, fileUri);
                targets.push(buildTarget);
            }
            catch (error) {
                console.debug(`Build target not found ${filePath}`);
                console.error(error);
            }
        }
    }
    return targets;
};

