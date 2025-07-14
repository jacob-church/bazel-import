import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionState, getExtensionState, setTerminal } from '../extension';
import { MockData, MockTerminal } from './__mock__/terminal';
import { cleanupGraceful, cleanupWorkspace, setupWorkspace } from './workspacesetup';
import *as _fs_ from 'fs';
import {executeCommand} from '../analysis/bazelutil';

let testWorkspaceFolder: string;

process.on('SIGINT', () => cleanupGraceful('SIGINT', testWorkspaceFolder));
process.on('SIGTERM', () => cleanupGraceful('SIGTERM', testWorkspaceFolder));
process.on('exit', (code) => cleanupGraceful(code, testWorkspaceFolder));

async function awaitState(state: ExtensionState) {
    const waiter = new Promise<void>(resolve => {
        let interval = setInterval(() => {
                if (getExtensionState() === state) {
                    clearInterval(interval);
                    resolve();
                }
            }, 500);
    });
    await waiter; 
}



suite.only("Deletion", () => {
    // Create a temporary workspace for tests
    let package1: string;
    let package2: string;

    const testTerminal: vscode.Terminal = new MockTerminal();

    suiteSetup(async () => {
        ({testWorkspaceFolder, package1, package2} = await setupWorkspace());
    });

    setup(async () => {
        // Mock terminal
        testTerminal.sendText("");
        setTerminal(testTerminal); 
    });

    teardown(async () => {
        testTerminal.sendText("");
        setTerminal(testTerminal);
    });


    // One import on each 
    // Remove all imports --> test that it removes import from all (check bazel build for empty/no deps)
    // One import --> test that it removes one import [reorder these]
    test("Should remove unnecessary dependencies from bazel BUILD", async () => {
        
        const testUri = vscode.Uri.file(path.join(package1, "test1.ts"));

        let editor = await vscode.window.showTextDocument(testUri);

        await awaitState(ExtensionState.active);

        await editor.edit(editBuilder => {
            const range = new vscode.Range(0, 0, 1, 0);
            editBuilder.delete(range);
        });

        await awaitState(ExtensionState.ready);

        let removeOne: MockData = JSON.parse(testTerminal.name); 

        assert(removeOne.data.remove.includes("//ts/src/package2"));
        assert(removeOne.data.raw.includes("//ts/src/package1")); // Target is correct
        assert(!removeOne.data.raw.includes("//ts/src/package3"));
        assert(!removeOne.data.raw.includes("//ts/src/package3/package4"));
        assert(removeOne.data.raw.includes("remove deps")); 

        await editor.edit(editBuilder => {
            const range = new vscode.Range(0, 0, 2, 0);
            editBuilder.delete(range);
        });

        await awaitState(ExtensionState.ready);

        let removeRemaining: MockData = JSON.parse(testTerminal.name);
        
        assert(!removeRemaining.data.raw.includes("//ts/src/package2"));
        assert(removeRemaining.data.raw.includes("//ts/src/package1"));
        assert(removeRemaining.data.remove.includes("//ts/src/package3"));
        assert(removeRemaining.data.remove.includes("//ts/src/package3/package4"));
        assert(removeRemaining.data.raw.includes("remove deps")); 
        await editor.document.save();
    });

    test("Should not remove dependencies that still exist", async () => {

        const testUri = vscode.Uri.file(path.join(package2, "sub2", "test2a.ts"));

        const editor = await vscode.window.showTextDocument(testUri); 
        await awaitState(ExtensionState.active); 

        // Delete imports that won't change dependencies
        await editor.edit(editBuilder => {
            const deletion = new vscode.Range(0, 0, 4, 0);
            editBuilder.delete(deletion); 
        });

        await awaitState(ExtensionState.ready); 

        let removedDependences: MockData = JSON.parse(testTerminal.name);

        assert.strictEqual(removedDependences.data.raw, "");
        await editor.document.save();
 
    });

    suiteTeardown( async () => {
        await vscode.workspace.saveAll();
        console.log("Deleting directory", testWorkspaceFolder);
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        console.log("Editor closed");
        await cleanupWorkspace(testWorkspaceFolder);
    });
});

function saveAll() {
    for (const tabGroup of vscode.window.tabGroups.all) {
        for (const tab of tabGroup.tabs) {
            console.log(tab.isDirty);
        }
    }
}