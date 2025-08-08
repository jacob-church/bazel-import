import * as vscode from 'vscode';
import { Cache } from '../model/basecache';
import {TS_LANGUAGE_ID, ExtensionState, setExtensionState, updateStatusBar} from '../extension';
import { ActiveFile } from '../model/activeFile';
import {MAX_PKG_SIZE, updateMaxPackageSize} from '../userinteraction';
import * as path from 'path';
import { bazelLabelToUris, fsToWsPath, uriToBuild } from '../util/filepathtools';
import { packageTooLarge } from '../util/packagetools';
import { streamTargetInfosFromFilePaths } from '../util/bazeltools';
import { TargetInfo } from '../model/bazelquery/targetinfo';
import { FilesContext } from '../model/bazelquery/filescontext';

export {cache as PkgCache};

const CHANGE_PACKAGE_LIMIT_BUTTON = 'Change max package size';
const CACHE_SIZE: number = Number(vscode.workspace.getConfiguration('bazel-import').maxCacheSize);
const cache = new Cache<string, ActiveData>(CACHE_SIZE);
const DELETION_ENABLED = vscode.workspace.getConfiguration('bazel-import').enableDeletion;

export interface ActiveData {
    context: FilesContext<string, string, TargetInfo>
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
    
    // This build target is no longer valid (uriToBuild should use another mechanism)
    // BUT this is useful for determining whether or not an active file is actually in a package
    const [, buildUri] = uriToBuild(document.uri) ?? [, ];

    if (buildUri === undefined) {
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


    // Needed info: (key is uri string?)
    const value = cache.get(buildUri.toString());
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
        const [context, packageSources, target] = await loadPackageSources(document.uri, buildUri); 
        ActiveFile.data = {
            packageSources: packageSources,
            buildUri: buildUri,
            target: target,
            documentState: document.getText(),
            uri: document.uri,
            context: context
        };
        // TODO: maybe remove this
        if (!packageTooLarge()) {
            cache.set(
                buildUri.toString(),
            {
                context: context,
                packageSources: packageSources, 
                buildUri: buildUri,
            });
        }
    }

    validatePackageSize();

    setDeletionStatus(fileName);
    setExtensionState(ExtensionState.active);
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

function uriToPkgString(uri: vscode.Uri) {
    const fsPath = uri.fsPath;
    const pkgDir = path.dirname(fsPath);
    if (pkgDir.endsWith('/')) {
        return pkgDir.slice(0, pkgDir.length - 1) + ':*';
    }
    return pkgDir + ':*';
}

export async function loadPackageSources(fileUri: vscode.Uri, buildUri: vscode.Uri): Promise<[FilesContext<string,string,TargetInfo>, vscode.Uri[], string]> {
    const pkgString = uriToPkgString(buildUri);
    const context = await streamTargetInfosFromFilePaths([pkgString]);

    const wsPath = fsToWsPath(fileUri.fsPath);
    const info = context.getInfo(wsPath);

    if (info === undefined) {
        throw new Error("Package Info undefined");
    }

    const packageSources = bazelLabelToUris(info.srcs);

    return [context, packageSources, info.name];
};

function setDeletionStatus(fileName: string) {
    const enabledStatus = packageTooLarge() ? "disabled" : "enabled";
    updateStatusBar(
        new vscode.MarkdownString(`Deletions ${enabledStatus} for\n\`${fileName}\``),
        '$(wand)'
    );
}
