import * as vscode from 'vscode';
import { getTargetsFromTextAndFile } from './filetools';

const MIN_LENGTH = 7; // Minimum length of a ts import "from ''"

export function getBuildTargetsFromDeletions(text: string, event: vscode.TextDocumentChangeEvent) {
    return getTargetsFromEvent(
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

export function getBuildTargetsFromAdditions(event: vscode.TextDocumentChangeEvent) {
    return getTargetsFromEvent(
        event,
        (change) => change.text,
        isChangeAddition
    );
}

const isChangeAddition = (change: vscode.TextDocumentContentChangeEvent) => {
    return change.text.length > MIN_LENGTH || change.rangeLength > MIN_LENGTH;
};

function getTargetsFromEvent(
    event: vscode.TextDocumentChangeEvent, 
    textSrc: (change: vscode.TextDocumentContentChangeEvent) => string, 
    isValid: (change: vscode.TextDocumentContentChangeEvent) => boolean
) {
    const changes = event.contentChanges;

    const targets: Set<string> = new Set<string>();

    for (const change of changes) {
        if (!isValid(change)) {
            continue;
        }

        const importTargets = getTargetsFromTextAndFile(
            textSrc(change),
            event.document.uri
        );
        for (const target of importTargets) {
            targets.add(target);
        }
    }
    return targets;
}