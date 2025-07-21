import * as vscode from 'vscode';
import { Cache } from '../util/basecache';
import {TS_LANGUAGE_ID, ExtensionState, setExtensionState, updateStatusBar} from '../extension';
import {uriToContainingUri} from '../util/uritools';
import { ActiveFile } from '../model/activeFile';
import {MAX_PKG_SIZE, showDismissableMessage, showErrorMessage, updateMaxPackageSize} from '../userinteraction';
import * as path from 'path';
import { uriToBuild } from '../util/filepathtools';
import { getPackageSourceUris, packageTooLarge } from '../util/packagetools';

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

export async function updateActiveEditor(editor: vscode.TextEditor | undefined) {
    if (editor === undefined || !vscode.workspace.getConfiguration('bazel-import').enableDeletion) {
        return; 
    }
    setExtensionState(ExtensionState.inactive); 

    const document = editor.document; 
    const fileName = document.fileName.substring(document.fileName.lastIndexOf('/') + 1);
    
    if (document.languageId !== TS_LANGUAGE_ID) {
        updateStatusBar(
            new vscode.MarkdownString('Bazel import deletion only works with `typescript` files'),
            '$(eye-closed)'
        );
        return;
    }
    
    if (uriToBuild(document.uri) === undefined) {
        updateStatusBar(
            'File not part of bazel package',
            '$(eye-closed)'
        );
        return;
    }

    updateStatusBar(
        `Loading packages for deletion analysis. Current package size is ${vscode.workspace.getConfiguration('bazel-import').maxPackageSize}`,
        '$(loading~spin)'
    );

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
 * Checks if the new document is in the old document's directory (i.e., does not need package update)
*/
function handleActiveFileDirectoryChange(document: vscode.TextDocument) {
    let oldDir = undefined; 
    if (ActiveFile.data) {
        oldDir = uriToContainingUri(ActiveFile.data.buildUri);
    }

    let newDir = uriToContainingUri(document.uri); 
    if (newDir.toString() === oldDir?.toString()) {
        console.log("No need to reload the build packages");
        ActiveFile.data.uri = document.uri;
        ActiveFile.data.documentState = document.getText(); 
        return undefined;
    }
    return newDir; 
}

/**
 * Sets the deletion enabled flag depending on the size of the current package and informs user of status
 */ 
function validatePackageSize() {
    let deletion = 'enabled';
        
    if (packageTooLarge()) {
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

function urisFromStrings(strings: string[]): vscode.Uri[] {
    return strings.map(strUri => vscode.Uri.parse(strUri)); 
}

async function loadPackageSources(document: vscode.TextDocument) {
    const currentTargetPair = await getPackageSourceUris(uriToContainingUri(document.uri));
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

function setDeletionStatus(fileName: string) {
    const enabledStatus = packageTooLarge() ? "disabled" : "enabled";
    updateStatusBar(
        new vscode.MarkdownString(`Deletions ${enabledStatus} for\n\`${fileName}\``),
        '$(wand)'
    );
}
