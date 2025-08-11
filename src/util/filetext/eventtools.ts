import * as vscode from 'vscode';
import { getFullImportPathsFromTextAndFile } from './importtools';

const MIN_LENGTH = 7; // Minimum length of a ts import "from ''"

export function getDeletedImportPaths(text: string, event: vscode.TextDocumentChangeEvent) {
    return getFullPathsFromEvent(
        event,
        (change) => {
            const startIndex = event.document.offsetAt(change.range.start);
            const endIndex = Math.max(event.document.offsetAt(change.range.end), startIndex + change.rangeLength);
            return text.substring(startIndex, endIndex);
        },
        isChangeDelete
    );
}

const isChangeDelete = (change: vscode.TextDocumentContentChangeEvent): boolean => {
    return change.text === '' && change.rangeLength > MIN_LENGTH;
};

export function getAddedImportPaths(event: vscode.TextDocumentChangeEvent) {
    return getFullPathsFromEvent(
        event,
        (change) => change.text,
        isChangeAddition
    );
}

const isChangeAddition = (change: vscode.TextDocumentContentChangeEvent) => {
    return change.text.length > MIN_LENGTH || change.rangeLength > MIN_LENGTH;
};

function getFullPathsFromEvent(
    event: vscode.TextDocumentChangeEvent, 
    textSrc: (change: vscode.TextDocumentContentChangeEvent) => string, 
    isValid: (change: vscode.TextDocumentContentChangeEvent) => boolean
): [string[], string[]] {
    const changes = event.contentChanges;

    const paths = [];
    const externalTargets = [];

    for (const change of changes) {
        if (!isValid(change)) {
            continue;
        }

        const [importPaths, externalTarget] = getFullImportPathsFromTextAndFile(
            textSrc(change),
            event.document.uri
        );
        paths.push(...importPaths);
        externalTargets.push(...externalTarget);
    }
    return [paths, externalTargets];
}