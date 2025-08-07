import * as vscode from 'vscode';
import { Cache } from '../model/basecache';
import {TS_LANGUAGE_ID, ExtensionState, setExtensionState, updateStatusBar} from '../extension';
import {uriEquals, uriToContainingUri} from '../util/uritools';
import { ActiveFile } from '../model/activeFile';
import {MAX_PKG_SIZE, showErrorMessage, updateMaxPackageSize} from '../userinteraction';
import * as path from 'path';
import { uriToBuild } from '../util/filepathtools';
import { getPackageSourceUris, packageTooLarge } from '../util/packagetools';

export {cache as PkgCache};

const CHANGE_PACKAGE_LIMIT_BUTTON = 'Change max package size';
const CACHE_SIZE: number = Number(vscode.workspace.getConfiguration('bazel-import').maxCacheSize);
const cache = new Cache<string, ActiveData>(CACHE_SIZE);
const DELETION_ENABLED = vscode.workspace.getConfiguration('bazel-import').enableDeletion;

export interface ActiveData {
    packageSources: Array<vscode.Uri>, // Uri string representation
    buildUri: vscode.Uri;
}

export async function updateActiveEditor(editor: vscode.TextEditor | undefined) {
    if (editor === undefined || !DELETION_ENABLED) {
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
    
    const [buildTarget, buildUri] = uriToBuild(document.uri) ?? [undefined, undefined];

    if (buildTarget === undefined) {
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

    const value = cache.get(buildTarget);
    if (value !== undefined) {
        console.debug("Cache hit", buildTarget);
        const packageSources = value.packageSources;
        const buildUri = value.buildUri; 

        ActiveFile.data = {
            packageSources: packageSources,
            buildUri: buildUri,
            target: buildTarget, 
            documentState: document.getText(),
            uri: document.uri,
        };
    }
    else {
        console.debug("Cache miss", buildTarget);
        await loadPackageSources(document); 
        if (!packageTooLarge()) {
            cache.set(
                ActiveFile.data.target,
            {
                packageSources: ActiveFile.data.packageSources, 
                buildUri: ActiveFile.data.buildUri,
            });
        }
    }

    validatePackageSize();

    setDeletionStatus(fileName);
    setExtensionState(ExtensionState.active);
}

/** 
 * Checks if the new document is in the old document's directory (i.e., does not need package update)
*/
function handleActiveFileDirectoryChange(newDocument: vscode.TextDocument) {
    let oldDir = undefined; 
    if (ActiveFile.data) {
        oldDir = uriToContainingUri(ActiveFile.data.buildUri);
    }

    let newDir = uriToContainingUri(newDocument.uri); 
    if (uriEquals(oldDir, newDir)) {
        console.log("No need to reload the build packages");
        ActiveFile.data.uri = newDocument.uri;
        ActiveFile.data.documentState = newDocument.getText(); 
        return undefined;
    }
    return newDir; 
}

/**
 * Sets the deletion enabled flag depending on the size of the current package
 */ 
function validatePackageSize() {
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
    }
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
