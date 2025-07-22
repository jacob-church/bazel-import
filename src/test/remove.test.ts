import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionState, getExtensionState } from '../extension';
import { cleanupGraceful, cleanupWorkspace, setupWorkspace } from './util/workspacesetup';
import { setupStub, StubData, StubDozer, teardownStub } from './util/stubtool';
import { updateBuildDeps } from '../util/exectools';

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

suite.only("Remove Deps", () => {
    // Create a temporary workspace for tests
    let package1: string;
    let package2: string;

    suiteSetup(async () => {
        ({testWorkspaceFolder, package1, package2} = await setupWorkspace());
        setupStub();
    });

    setup(async () => {
        updateBuildDeps({
            buildTarget: StubData.clear,
            fileUri: vscode.Uri.parse(testWorkspaceFolder)
        });
    });

    teardown(async () => {
        updateBuildDeps({
            buildTarget: StubData.clear,
            fileUri: vscode.Uri.parse(testWorkspaceFolder)
        });
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

        let buildozer: StubDozer = StubData.mostRecent(); 

        assert.strictEqual(buildozer.target, "//ts/src/package1");
        assert(buildozer.remove.includes("//ts/src/package2"));
        assert.strictEqual(buildozer.remove.length, 1);
        assert.strictEqual(buildozer.add.length, 0); 
        assert.strictEqual(StubData.count(), 1);

        await editor.edit(editBuilder => {
            const range = new vscode.Range(0, 0, 2, 0);
            editBuilder.delete(range);
        });

        await awaitState(ExtensionState.ready);

        buildozer = StubData.mostRecent();
        
        assert.strictEqual(buildozer.target,"//ts/src/package1");
        assert(buildozer.remove.includes("//ts/src/package3"));
        assert(buildozer.remove.includes("//ts/src/package3/package4"));
        assert.strictEqual(buildozer.remove.length, 2);
        assert.strictEqual(buildozer.add.length, 0); 
        assert.strictEqual(StubData.count(), 2);
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

        let buildozer: StubDozer = StubData.mostRecent();

        assert.strictEqual(buildozer.target, "//ts/src/package2"); 
        assert.strictEqual(buildozer.remove.length, 0); 
        assert.strictEqual(buildozer.add.length, 0); 
        assert.strictEqual(StubData.count(), 1);
        await editor.document.save();
    });

    suiteTeardown( async () => {
        teardownStub();
        await vscode.workspace.saveAll();
        console.log("Deleting directory", testWorkspaceFolder);
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        console.log("Editor closed");
        await cleanupWorkspace(testWorkspaceFolder);
    });
});
