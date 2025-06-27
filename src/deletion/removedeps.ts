import * as vscode from 'vscode';
import { uriToBuildTarget } from '../targettools';
import { uriToContainingUri } from '../uritools';
import { urisFromTextChanges } from '../importparse';
import { uriToBuild, resolveModuleToUri } from './filepathtools';
import * as path from 'path';


const MIN_LENGTH = 7;

const isChangeDelete = (change: vscode.TextDocumentContentChangeEvent): boolean => {
    return change.text === '' && change.rangeLength > MIN_LENGTH;
};

export const getDeletionTargets = (oldText: string, event: vscode.TextDocumentChangeEvent) => {
    const changes: readonly vscode.TextDocumentContentChangeEvent[] = event.contentChanges; 
    const splitter = '\n';

    const importDeletions: string[] = new Array(); 
    for (let change of changes) {
        // Should this be combined with the adds? 
        if (!isChangeDelete(change)) {
            continue;
        }
        const startIndex = event.document.offsetAt(change.range.start);
        const endIndex = Math.max(event.document.offsetAt(change.range.end), startIndex + change.rangeLength);

        // TODO: switch to regex
        const deletion = oldText.substring(startIndex, endIndex);
        const deletedTexts = deletion.split(splitter);
        
        for (const deletedText of deletedTexts) {
            const filePathIndex = deletedText.indexOf("from \'") + 6; 
            if (filePathIndex >= 6) {

                importDeletions.push(deletedText.slice(filePathIndex, deletedText.length - 2)); 
            }
            else {
                console.log(`Deletion not an import:\n${deletedText}`);
            }
        }
    }
    return importDeletions; 
};

export const getBuildTargetFromFP = (importPath: string, currentFile: vscode.Uri): [string, vscode.Uri] => {
    let fileUri: vscode.Uri | undefined;
    const currentDir = uriToContainingUri(currentFile); 
    if (importPath.startsWith('.')) {
        importPath = path.resolve(path.dirname(currentFile.fsPath), importPath) + ".ts";
        fileUri = vscode.Uri.file(importPath); 
    }
    else {
        fileUri = resolveModuleToUri(currentFile, importPath);
    }

    if (!fileUri) {
        throw new Error("Unexpected lack of uri"); 
    }
    const target = uriToBuild(fileUri);
    if (!target) {
        throw new Error("Unexpected undefined target");
    }
    return target;
        // return (await uriToBuildTarget(uriToContainingUri(fileUri)))!;  
};

const getImportsFromFile = (fileText: string): RegExpMatchArray[] => {
    const query = new RegExp("from \'.*\';", "gi");

    return Array.from(fileText.matchAll(query));
};

export const getBuildTargetsFromFile = async (fileUri: vscode.Uri) => {
    const file = await vscode.workspace.openTextDocument(fileUri); 
    const fileText = file!.getText(); 

    const importMatches = getImportsFromFile(fileText); 

    const importPositions = importMatches.map(match => file!.positionAt(match.index! + 6)) as vscode.Position[];
    const fileUris = await urisFromPositions(importPositions, fileUri); 
    const targets = fileUris.map(fileUri => { // 7.49 s (with ts fully loaded)
        return uriToBuild(fileUri);
    });
    // const targets = await Promise.all(fileUris.map(fileUri => { // 6.2s (with ts fully loaded)
    //     return uriToBuildTarget(uriToContainingUri(fileUri));
    // }));
    return targets;
};

const urisFromPositions = async (positions: vscode.Position[], docUri: vscode.Uri) => {
    return urisFromTextChanges(positions, docUri); 
};

