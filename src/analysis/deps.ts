import * as vscode from 'vscode';
import * as path from 'path';
import { uriToBuild } from '../deletion/filepathtools';
import { BUILD_FILE, getTerminal } from '../extension';
import { getBuildTargetsFromFile } from '../deletion/removedeps';
import { otherTargetsUris } from '../targettools';
import { uriToContainingUri } from '../uritools';
import { getBazelDeps } from './bazelutil';
import { showDismissableFileMessage, showDismissableMessage } from '../userinteraction';

/** 
 * Idea: add status bar item, shortcut, or icon => onclick select target file 🗹
 * 1. Finds the build target for the file -------------------------------- 🗹
 * 2. Queries the current target list => set ----------------------------- 🗹
 * 3. Finds the package using the active editor workflow ----------------- 🗹
 * 4. Queries the bazel dep targets -------------------------------------- 🗹
 * 5. If those targets match the current target set then do nothing ------ 🗹
 * 6. Else add/remove dependencies that don't exist (using buildozer) ---- 🗹
 */

const CURRENT_FILE: string = '$(file) Current file';
const SELECT_FILE: string = '$(file-directory) Select a file';


export const statusBarOptions = async (file?: vscode.Uri) => {
    if (file) {
        runDeps(file);
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
            runDeps(vscode.window.activeTextEditor?.document.uri);
            break;
        case SELECT_FILE:
            const file = await getFile();
            runDeps(file);
            break;
        default:
            vscode.window.showWarningMessage("Something went wrong");
    }
};

const getFile = async () => {
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
            'Package files': ['ts', 'bazel'],
            'All files': ['*']
        },
        defaultUri: startUri,
    });

    return (fileUri && fileUri.length > 0) ? fileUri[0] : undefined; 
};

export const runDeps = async (file: vscode.Uri | undefined) => {
    console.debug("Running deps on", file);
    if (file === undefined) {
        console.error("File not defined");
        // Probably alert user
        return; 
    }

    return vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: "Bazel import",
    cancellable: true
}, async (progress, token) => { // <-- 'token' (CancellationToken) is now available
        try {
            let modificationsMade = false; 
            const cancellationDisposable = token.onCancellationRequested(() => {
                showDismissableMessage("Dependency fix halted");
                if (modificationsMade) {
                    vscode.window.showWarningMessage("Files modified. Check package for incorrect dependencies"); // TODO point this to build file
                }
            });

            // Get build target
            progress.report({message: "finding build dependencies"});
            const [buildTarget, buildUri] = uriToBuild(file) ?? ["", file];
            if (buildTarget === "" || token.isCancellationRequested) { // Probably not ideal for ui but it probably won't be there long
                cancellationDisposable.dispose();
                return;
            }
            console.debug("Target", buildTarget, "Uri", buildUri); 
            
            // Get current bazel deps
            const depsString: string = await getBazelDeps(
                buildTarget, 
                path.dirname(file.fsPath), 
                vscode.workspace.getConfiguration('bazel-import').excludeDependencies
            );
            console.debug("Deps string", depsString);
            const depsArray = depsString.split('\n').filter((dep) => dep.indexOf(':') >= 0).map(dep => {
                const pkgIdx = dep.indexOf(':');
                return dep.slice(0, pkgIdx);
            });
            const currentDeps: Set<string> = new Set(depsArray); 
            console.debug("Build deps", currentDeps);
            if (token.isCancellationRequested) {
                cancellationDisposable.dispose();
                return; 
            }

            // Get current package sources
            progress.report({message: "getting current package"});
            const [packageUris,,] = await otherTargetsUris(uriToContainingUri(file)) ?? [undefined, undefined, undefined];
            if (packageUris === undefined || token.isCancellationRequested) {
                cancellationDisposable.dispose();
                return;
            }

            progress.report({message: `analyzing dependencies for ${packageUris.length} source file(s)`});
            const dependencyTargets = new Set<string>();
            await Promise.all(packageUris.map(async sourceUri => {
                const targets = await getBuildTargetsFromFile(sourceUri); 
                for (const target of targets) {
                    if (target === undefined) {
                        break;
                    }
                    dependencyTargets.add(target[0]);
                }
            }));
            // Needed so it doesn't add self dependency
            dependencyTargets.delete(buildTarget);
            console.debug("Dependencies", dependencyTargets);
            if (dependencyTargets.size === 0 || token.isCancellationRequested) {
                cancellationDisposable.dispose();
                return;
            }

            progress.report({message: "comparing dependencies and modifying build file"});
            const addDeps: string[] = [];
            for (const target of dependencyTargets) {
                if (!currentDeps.delete(target)) {
                    addDeps.push(target);
                }
            }
            const removeDeps: string[] = Array.from(currentDeps);
            console.debug("Add", addDeps, "Remove", removeDeps); 
            if (addDeps.length === 0 && removeDeps.length === 0) {
                cancellationDisposable.dispose();
                showDismissableMessage("Dependencies already up to date");
                return;
            }

            let terminal = getTerminal();
            if (!terminal) {
                terminal = vscode.window.createTerminal({
                    hideFromUser: true,
                    isTransient: true,
                });
            }
            const add = addDeps.join(' ').trim(); 
            const remove = removeDeps.join(' ').trim();
            const buildozerRemove = remove.length > 0 ? `buildozer "remove deps ${remove}" "${buildTarget}"; ` : ""; 
            const buildozerAdd = add.length > 0 ? `buildozer "add deps ${add}" "${buildTarget}"` : "";
            const buildozer = buildozerRemove.concat(buildozerAdd);

            if (buildozer) {
                modificationsMade = true;
                console.log(`Executing command: ${buildozer}`);
                terminal.sendText(buildozer);
            }
            showDismissableFileMessage(
                `Removed ${removeDeps.length} and added ${addDeps.length} dep(s) to ${BUILD_FILE}`,
                buildUri
            );
            
            cancellationDisposable.dispose();

        } catch (error) {
            vscode.window.showErrorMessage("Failed to analyze dependencies");
            console.error(error);
        }
    });
};
