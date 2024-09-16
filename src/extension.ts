import * as vscode from 'vscode';
import {uriToContainingUri} from './uritools';
import {uriToBuildTarget} from './targettools';
import {positionsFromTextChanges, urisFromTextChanges} from './importparse';
import {getImportedTargets} from './bazeltools';

const OPEN_BUTTON = 'Open';
const DISMISS_BUTTON = "Don't show this again";

let terminal: vscode.Terminal | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {
    vscode.workspace.onDidChangeTextDocument(async (changeEvent: vscode.TextDocumentChangeEvent) => {
        const targets = new Set();
        let currentTarget: string | undefined;
        let buildFileUri: vscode.Uri | undefined;

        // Step 1: Find symbol position for dependency lookup and external build targets (e.g. @angule/core)
        const [positions, externalTargets] = positionsFromTextChanges(changeEvent.contentChanges);
        externalTargets.forEach((val) => targets.add(val));
        if (positions.length + externalTargets.size === 0) {
            return;
        }

        // Step 2: Determine the current build target (e.g. where are we adding new dependencies to?)
        const currentUri = uriToContainingUri(changeEvent.document.uri);
        const currentTargetPair = await uriToBuildTarget(currentUri);
        currentTarget = currentTargetPair?.[0];
        buildFileUri = currentTargetPair?.[1];
        if (!currentTarget) {
            return;
        }

        // Step 3: Lookup Symbols and find the file paths where they are defined
        const uris = await urisFromTextChanges(positions, changeEvent.document.uri);
        if (uris.length === 0) {
            return;
        }

        // Step 4: Convert file paths to relevant build targets
        const depTargets = await getImportedTargets(uris, currentTarget);
        depTargets.forEach((val) => targets.add(val));
        if (targets.size === 0) {
            return;
        }

        // Step 5: Do the update
        if (!terminal) {
            terminal = vscode.window.createTerminal({
                hideFromUser: true,
                isTransient: true,
            });
        }
        const deps = Array.from(targets).join(' ');
        const buildozer = `buildozer "add deps ${deps}" "${currentTarget}"`;
        console.log(`Executing: ${buildozer}`);
        terminal.sendText(buildozer);
        if (vscode.workspace.getConfiguration('bazel-import').notifyChange) {
            const buildFile = vscode.workspace.getConfiguration('bazel-import').buildFile;
            vscode.window
                .showInformationMessage(`Bazel deps added to ${buildFile}`, OPEN_BUTTON, DISMISS_BUTTON)
                .then((button) => {
                    if (button === OPEN_BUTTON && buildFileUri) {
                        vscode.window.showTextDocument(buildFileUri);
                    }
                    if (button === DISMISS_BUTTON) {
                        vscode.workspace.getConfiguration('bazel-import').update('notifyChange', false);
                    }
                });
        }
    });
}

export function deactivate() {
    terminal?.dispose();
}
