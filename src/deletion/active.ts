import * as vscode from 'vscode';
import { Cache } from './basecache';
import {handleActiveFileDirectoryChange, TS_LANGUAGE_ID, ExtensionState, setExtensionState, activeStatusBarItem} from '../extension';
import {uriToContainingUri} from '../uritools';
import {packageSourceUris} from '../targettools';
import { ActiveFile } from '../model/activeFile';
import {MAX_PKG_SIZE, showDismissableMessage, showErrorMessage, updateMaxPackageSize} from '../userinteraction';
import * as path from 'path';

const CHANGE_PACKAGE_LIMIT_BUTTON = 'Change max package size';
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

async function loadPackageSources(document: vscode.TextDocument) {
    const currentTargetPair = await packageSourceUris(uriToContainingUri(document.uri));
    if (currentTargetPair === undefined) {
        showErrorMessage(
            `${path.basename(document.uri.fsPath)} failed to open`
        );
        return;
    }
    const packageSources = currentTargetPair[0]; 
    const currentTarget = currentTargetPair[1];
    const currBuildURI = currentTargetPair[2];

    ActiveFile.data = {
        packageSources: packageSources,
        target: currentTarget,
        buildUri: currBuildURI, 
        documentState: document.getText(),
        uri: document.uri
    };
};

export async function updateActiveEditor(editor: vscode.TextEditor | undefined) {
    if (editor === undefined || !vscode.workspace.getConfiguration('bazel-import').enableDeletion) {
        return; 
    }
    setExtensionState(ExtensionState.inactive); 

    const document = editor.document; 
    const fileName = document.fileName.substring(document.fileName.lastIndexOf('/') + 1);
    
    if (document.languageId !== TS_LANGUAGE_ID) {
        activeStatusBarItem.text = '$(eye-closed)';
        activeStatusBarItem.tooltip = new vscode.MarkdownString('Bazel import deletion only works with `typescript` files'); 
        return;
    }

    activeStatusBarItem.text = '$(loading~spin)';
    activeStatusBarItem.tooltip = `Loading packages for deletion analysis. Current package size is ${vscode.workspace.getConfiguration('bazel-import').maxPackageSize}`; 

    const newDir = handleActiveFileDirectoryChange(document);
    if (newDir === undefined) {
        setDeletionStatus(fileName);
        setExtensionState(ExtensionState.active);
        return; 
    }

    let found = false; 
    for (const {key, value} of cache) {
        if (value?.packageSources.has(document.uri.toString())) {
            const packageSources = urisFromStrings(Array.from(value.packageSources));
            const buildUri = value.buildUri; 
            const target = key;

            ActiveFile.data = {
                packageSources: packageSources,
                buildUri: buildUri,
                target: target.target, 
                documentState: document.getText(),
                uri: document.uri,
            };

            found = true; 
            cache.get(key);
            break;
        }
    }
    if (!found) {
        await loadPackageSources(document); 
    }

    validatePackageSize();

    cache.set({
        target: ActiveFile.data.target,
    }, {
        packageSources: new Set(ActiveFile.data.packageSources.map(src => src.toString())), 
        buildUri: ActiveFile.data.buildUri,
    });

    setDeletionStatus(fileName);
    setExtensionState(ExtensionState.active);
}

/**
 * Sets the deletion enabled flag depending on the size of the current package and informs user of status
 */ 
function validatePackageSize() {
    let deletion = 'enabled';
        
    if ((ActiveFile.data.packageSources.length ?? MAX_PKG_SIZE + 1) > MAX_PKG_SIZE) {
        vscode.window
            .showWarningMessage(
                `${ActiveFile.data.packageSources.length} file(s) in package. Increase max package size? (current max: ${MAX_PKG_SIZE})`, 
                CHANGE_PACKAGE_LIMIT_BUTTON
            ).then((button) => {
                if (button === CHANGE_PACKAGE_LIMIT_BUTTON) {
                    updateMaxPackageSize(); 
                }
            });
        deletion = 'disabled';
    }

    const msg = `${path.basename(ActiveFile.data.uri.fsPath ?? "undefined")} opened with deletion ${deletion}`;
    showDismissableMessage(msg);
}

export function packageTooLarge(): boolean {
    return (ActiveFile.data.packageSources.length ?? MAX_PKG_SIZE + 1) > MAX_PKG_SIZE;
}

function setDeletionStatus(fileName: string) {
    activeStatusBarItem.text = '$(wand)';
    const enabledStatus = packageTooLarge() ? "disabled" : "enabled";
    activeStatusBarItem.tooltip = new vscode.MarkdownString(`Deletions ${enabledStatus} for\n\`${fileName}\``);
}
