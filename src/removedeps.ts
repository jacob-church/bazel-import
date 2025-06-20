import * as vscode from 'vscode';
import { uriToBuildTarget } from './targettools';
import { uriToContainingUri } from './uritools';
import { urisFromTextChanges } from './importparse';


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

const config = new Map<string, string>(); 
config.set("@lucid", "cake/app/webroot/ts");
config.set("@scala", "bazel-out/k8-fastbuild/bin/src/jvm/com/lucidchart");
config.set("lucid-extension-sdk", "extensibility/lucid-extension-sdk"); 

export const getBuildTargetFromFP = async (filePath: string, currentDir: vscode.Uri): Promise<[string, vscode.Uri]> => {
    for (const [key, value] of config) {
        if (filePath.startsWith(key)) {
            filePath = filePath.replace(key, value); 
            break; 
        }
    }
    if (filePath.startsWith('./')) {
        filePath = currentDir.fsPath + filePath.slice(1) + '.ts'; 
    }
    else if (filePath.startsWith('../')) {
        let folderPath = currentDir.fsPath;
        while (filePath.startsWith('../')) {
            folderPath = folderPath.slice(0, folderPath.lastIndexOf('/'));
            filePath = filePath.slice(3);  
        } 
        filePath = folderPath + '/' + filePath + '.ts'; 
    }
    else {
        const root = vscode.workspace.workspaceFolders![0].uri.fsPath;
        filePath = root + '/' + filePath + '.ts';
    }
    
    const sourceUri: vscode.Uri = vscode.Uri.file(filePath); 

    const target = await uriToBuildTarget(uriToContainingUri(sourceUri));
    return target!; 
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
    const buildUris = [];
    for (fileUri of fileUris) {
        const thing = await uriToBuildTarget(uriToContainingUri(fileUri)); // TODO: rename
        buildUris.push(thing);
    }
    return buildUris;
};

const urisFromPositions = async (positions: vscode.Position[], docUri: vscode.Uri) => {
    return urisFromTextChanges(positions, docUri); 
};