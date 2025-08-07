import * as vscode from 'vscode';
import { fsToWsPath, uriToBuild } from '../util/filepathtools';
import { BUILD_FILE } from '../extension';
import { handleBuildozerError, updateBuildDeps } from '../util/exectools';
import { showDismissableFileMessage, showDismissableMessage } from '../userinteraction';
import { getImportPathsFromPackage } from '../util/packagetools';
import { ActiveData, loadPackageSources, PkgCache } from './active';
import * as assert from 'assert';
import { streamTargetInfosFromFilePaths } from '../util/bazeltools';
import { pathsToTargets } from './remove';


const CURRENT_FILE: string = '$(file) Current file';
const SELECT_FILE: string = '$(file-directory) Select a file';
const EXCLUDED_DEPENDENCIES = vscode.workspace.getConfiguration('bazel-import').excludeDependencies ?? undefined;


export async function chooseFileToFixDeps(file?: vscode.Uri) {
    if (file) {
        runDepsFix(file);
        return;
    }

    const options: vscode.QuickPickItem[] = [
        {
            label: CURRENT_FILE
        },
        {
            label: SELECT_FILE
        },
    ];
    
    const selection = await vscode.window.showQuickPick(options, {
        placeHolder: "Select a file to fix bazel deps for its package",
        canPickMany: false, // User can only pick one
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (!selection) {
        // TODO: do something UI/UX
        return;
    }

    switch (selection.label) {
        case CURRENT_FILE:
            runDepsFix(vscode.window.activeTextEditor?.document.uri);
            break;
        case SELECT_FILE:
            const file = await getFile();
            runDepsFix(file);
            break;
        default:
            vscode.window.showWarningMessage("Something went wrong");
    }
};

async function getFile() {
    const startUri = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.document.uri : (
        vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
            ? vscode.workspace.workspaceFolders[0].uri
            : undefined
    );

    const fileUri =  await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: "Select file",
        filters: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'Package files': ['ts', 'bazel'],
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'All files': ['*']
        },
        defaultUri: startUri,
    });

    return (fileUri && fileUri.length > 0) ? fileUri[0] : undefined; 
};

export async function runDepsFix(file: vscode.Uri | undefined) {
    if (file === undefined) {
        console.error("File not defined");
        showDismissableMessage("No file selected");
        return; 
    }
    console.debug("Running deps on", file);
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Bazel import",
        cancellable: true
    }, async (progress, token) => {
        try {
            let modificationsMade = false; 
            const cancellationDisposable = token.onCancellationRequested(() => {
                showDismissableMessage("Dependency fix halted");
                if (modificationsMade) {
                    vscode.window.showWarningMessage("Files modified. Check package for incorrect dependencies");
                }
            });

            const shouldHalt = (expression: boolean = false, haltmsg?: string) => {
                if (expression || token.isCancellationRequested) {
                    cancellationDisposable.dispose();
                    haltmsg === undefined ? "" : showDismissableMessage(haltmsg);
                    return true;
                }
                return false;
            };

            // Get build target
            progress.report({message: "loading package context"});
            const [, buildUri] = uriToBuild(file) ??  [,];
            if (shouldHalt(buildUri === undefined, "No build target found")) { return; }
            assert(buildUri !== undefined); // Type checker

            // Check cache and load on miss 
            let data: ActiveData | undefined = PkgCache.get(buildUri.toString());
            if (data === undefined) {
                // TODO: consider putting this in a method and use in active.ts
                const [pkgcontext, packageSources, name] = await loadPackageSources(file);
                data = {
                    context: pkgcontext,
                    packageSources: packageSources,
                    buildUri: buildUri
                };
                PkgCache.set(buildUri.toString(), data); 
            }

            const wsPath = fsToWsPath(file.fsPath);
            const pkgInfo = data.context.getInfo(wsPath);
            if (shouldHalt(pkgInfo === undefined, "Error in package")) { return; }
            assert(pkgInfo !== undefined); // Type checker
            const preFixDeps = new Set(pkgInfo.deps);

            progress.report({message: `finding dependencies for ${data.packageSources.length} source file(s)`});
            const importPaths = await getImportPathsFromPackage(data.packageSources);

            const context = await streamTargetInfosFromFilePaths(importPaths);

            const currentDependencyTargets = pathsToTargets(importPaths, context);

            // Needed so it doesn't add self dependency
            currentDependencyTargets.delete(pkgInfo.name);
            console.debug("New dependencies", currentDependencyTargets);
            if (shouldHalt(currentDependencyTargets.size === 0)) { return; }

            progress.report({message: "comparing dependencies and modifying build file"});
            const removeDeps: string[] = [];
            for (const target of preFixDeps) {
                if (!currentDependencyTargets.delete(target)) {
                    removeDeps.push(target);
                }
            }
            const addDeps: string[] = Array.from(currentDependencyTargets);
            console.debug("Add", addDeps, "Remove", removeDeps); 
            if (shouldHalt((addDeps.length === 0 && removeDeps.length === 0), "Dependencies already up to date")) { return; }

            modificationsMade = await updateBuildDeps({ addDeps, removeDeps, buildTarget: pkgInfo.name, fileUri: file });
            showDismissableFileMessage(
                `Removed ${removeDeps.length} and added ${addDeps.length} dep(s) to ${BUILD_FILE}`,
                buildUri
            );
            
            cancellationDisposable.dispose();
        } catch (error) {
            handleBuildozerError({ error });
        }
    });
};

