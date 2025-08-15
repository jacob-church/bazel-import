import * as vscode from 'vscode';
import { Cache } from '../model/basecache';
import {ExtensionState, setExtensionState, updateStatusBar} from '../extension';
import { getConfig, TS_LANGUAGE_ID } from '../config/config';
import { ActiveFile } from '../model/activeFile';
import { MAX_PKG_SIZE, setDeletionStatus, showChangeMaxSize, showErrorMessage } from '../ui/userinteraction';
import * as path from 'path';
import { fsToWsPath } from '../util/path/filepathtools';
import { uriToBuild } from '../util/path/uritools';
import { loadPackageSources, packageTooLarge } from '../util/path/packagetools';
import { PkgContext } from '../model/bazelquery/packagecontext';

export const CHANGE_PACKAGE_LIMIT_BUTTON = 'Change max package size';
const CACHE_SIZE: number = Number(getConfig("maxCacheSize"));
const cache = new Cache<string, ActiveData>(CACHE_SIZE);
export {cache as PkgCache};
const DELETION_ENABLED = getConfig("enableDeletion");

export interface ActiveData {
    context: PkgContext
    packageSources: Array<vscode.Uri>, // Uri string representation
    buildUri: vscode.Uri;
}

export async function updateActiveEditor(editor: vscode.TextEditor | undefined) {
    if (editor === undefined || !DELETION_ENABLED) {
        return;
    }
    setExtensionState(ExtensionState.inactive); 

    const document = editor.document; 
    const fileName = path.basename(document.fileName);
    
    if (document.languageId !== TS_LANGUAGE_ID) {
        updateStatusBar(
            new vscode.MarkdownString('Bazel import deletion only works with `typescript` files'),
            '$(eye-closed)'
        );
        return;
    }
    
    const buildUri = uriToBuild(document.uri);
    if (buildUri === undefined) {
        updateStatusBar(
            'File not part of bazel package',
            '$(eye-closed)'
        );
        return;
    }

    updateStatusBar(
        `Loading packages for deletion analysis. Current package size is ${getConfig("maxPackageSize")}`,
        '$(loading~spin)'
    );

    const value = cache.get(buildUri.toString());
    await updateActiveFile(value, buildUri, document);

    validatePackageSize();

    setDeletionStatus(fileName);
    setExtensionState(ExtensionState.active);
}

async function updateActiveFile(value: ActiveData | undefined, buildUri: vscode.Uri, document: vscode.TextDocument) {
    if (value !== undefined) {
        console.debug("Cache hit", buildUri.toString());
        const packageSources = value.packageSources;
        const buildTarget = value.context.getTarget(fsToWsPath(document.uri.fsPath));
        if (buildTarget === undefined) {
            throw new Error('Build Target undefined');
        }

        ActiveFile.data = {
            packageSources: packageSources,
            buildUri: buildUri,
            target: buildTarget,
            documentState: document.getText(),
            uri: document.uri,
            context: value.context
        };
    }
    else {
        console.debug("Cache miss", buildUri.toString());
        const [context, packageSources, target] = await loadPackageSources(document.uri, buildUri) ?? [,,];
        if (context === undefined) {
            showErrorMessage("Package failed to load");
            updateStatusBar(
                'Package not parsed',
                '$(eye-closed)'
            );
            return;
        }
        ActiveFile.data = {
            packageSources: packageSources,
            buildUri: buildUri,
            target: target,
            documentState: document.getText(),
            uri: document.uri,
            context: context
        };
        cache.set(
            buildUri.toString(),
            {
                context: context,
                packageSources: packageSources,
                buildUri: buildUri,
            }
        );
    }
}

/**
 * Sets the deletion enabled flag depending on the size of the current package
 */ 
function validatePackageSize() {
    if (packageTooLarge()) {
        showChangeMaxSize(`${ActiveFile.data.packageSources.length} file(s) in package. Increase max package size? (current max: ${MAX_PKG_SIZE})`);
    }
}
