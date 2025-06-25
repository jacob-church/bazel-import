import * as vscode from 'vscode';
import { Cache } from './basecache';
import {getActiveFile, getEnabledStatus, getStatusBarItem, setActiveFile, handleActiveFileDirectoryChange, TS_LANGUAGE_ID, validatePackageSize, ExtensionState, setState} from './extension';
import {uriToContainingUri} from './uritools';
import {otherTargetsUris} from './targettools';
import path = require('path');

const CACHE_SIZE: number = Number(vscode.workspace.getConfiguration('bazel-import').maxCacheSize);
const cache = new Cache<ActiveKey,ActiveData>(CACHE_SIZE);

export interface ActiveKey {
    target: string;
}

export interface ActiveData {
    packageSources: Set<string>, // Uri string representation
    buildUri: vscode.Uri;
}

function urisFromStrings(strings: string[]): vscode.Uri[] {
    return strings.map(strUri => vscode.Uri.parse(strUri)); 
}

async function loadSourcePackages(document: vscode.TextDocument) {
    const currentTargetPair = await otherTargetsUris(uriToContainingUri(document.uri));
    const packageSources = currentTargetPair?.[0] ?? []; 
    const currentTarget = currentTargetPair?.[1];
    const currBuildURI = currentTargetPair?.[2];
    
    if (!currentTarget || !packageSources || !currBuildURI) {
        vscode.window.showErrorMessage(
            `${path.basename(document.uri.fsPath)} failed to open`
        );
        return;
    }

    setActiveFile({
        packageSources: packageSources,
        target: currentTarget,
        buildUri: currBuildURI, 
        documentState: document.getText(),
        uri: document.uri
    });

    validatePackageSize(); 
};

export async function updateActiveEditor(editor: vscode.TextEditor | undefined) {
    if (editor === undefined || !vscode.workspace.getConfiguration('bazel-import').enableDeletion) {
        return; 
    }
    setState(ExtensionState.inactive); 

    const statusItem = getStatusBarItem();
    statusItem.show(); 
    const document = editor.document; 
    const fileName = document.fileName.substring(document.fileName.lastIndexOf('/') + 1);
    
    if (document.languageId !== TS_LANGUAGE_ID) {
        statusItem.text = '$(eye-closed)';
        statusItem.tooltip = new vscode.MarkdownString('Bazel import deletion only works with `typescript` files'); 
        return;
    }

    statusItem.text = '$(loading~spin)';
    statusItem.tooltip = `Loading packages for deletion analysis. Current package size is ${vscode.workspace.getConfiguration('bazel-import').maxPackageSize}`; 

    const newDir = handleActiveFileDirectoryChange(document);
    if (newDir === undefined) {
        setDeletionStatus(statusItem, fileName);
        setState(ExtensionState.active);
        return; 
    }

    let found = false; 
    for (const {key, value} of cache) {
        if (value?.packageSources.has(document.uri.toString())) {
            const packageSources = urisFromStrings(Array.from(value.packageSources));
            const buildUri = value.buildUri; 
            const target = key;

            setActiveFile({
                packageSources: packageSources,
                buildUri: buildUri,
                target: target.target, 
                documentState: document.getText(),
                uri: document.uri,
            });

            found = true; 
            cache.get(key);
            break;
        }
    }
    if (!found) {
        await loadSourcePackages(document); 
    }
    else {
        validatePackageSize();
    }

    const activeFile = getActiveFile(); // Active file needs to be locked
    if (activeFile === undefined) {
        throw Error("Unexpected null active file"); 
    }
    cache.set({
        target: activeFile.target,
    }, {
        packageSources: new Set(activeFile.packageSources.map(src => src.toString())), 
        buildUri: activeFile.buildUri,
    });

    setDeletionStatus(statusItem, fileName);
    setState(ExtensionState.active);
}

function setDeletionStatus(statusItem: vscode.StatusBarItem, fileName: string) {
    statusItem.text = '$(wand)';
    const enabledStatus = getEnabledStatus();
    statusItem.tooltip = new vscode.MarkdownString(`Deletions ${enabledStatus} for\n\`${fileName}\``);
}
