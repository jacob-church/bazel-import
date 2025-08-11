import {setupWorkspace, cleanupWorkspace, cleanupGraceful} from './util/workspacesetup';
import * as vscode from 'vscode';
import * as path from 'path';
import * as assert from 'assert';
import { runDepsFix } from "../groups/fixdeps";
import {executeCommand} from '../util/exec/exectools';
import { updateBuildDeps } from '../util/exec/buildozertools';
import {setupStub, StubData, StubDozer} from './util/stubtool';
import { addLineManually, deleteLineManually } from './util/edittools';

let testWorkspaceFolder: string;

process.on('SIGINT', () => cleanupGraceful('SIGINT', testWorkspaceFolder));
process.on('SIGTERM', () => cleanupGraceful('SIGTERM', testWorkspaceFolder));
process.on('exit', (code) => cleanupGraceful(code, testWorkspaceFolder));

suite.only("Fix Deps", () => {
    let package1: string;
    let package2: string;
    let package3: string;
    let package4: string;

    suiteSetup(async () => {
        ({testWorkspaceFolder, package1, package2, package3, package4} = await setupWorkspace(true));
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

    test("Should not do anything with correct deps", async () => {
        const documentUri = vscode.Uri.file(path.join(package3, "test3a.ts"));

        await runDepsFix(documentUri);

        let buildozer: StubDozer = StubData.mostRecent();

        assert(!buildozer);
        assert.strictEqual(StubData.count(), 0);
    });

    test("Should remove unused bazel deps", async () => {
        const documentUri = vscode.Uri.file(path.join(package2, 'sub2', 'test2a.ts'));
        const editor = await vscode.window.showTextDocument(documentUri);

        await deleteLineManually(editor, 4);

        await runDepsFix(documentUri);

        const buildozer: StubDozer = StubData.mostRecent();
        
        assert.strictEqual(buildozer.target, "//ts/src/package2"); 
        assert(buildozer.remove.includes("//ts/src/package3/package4"));
        assert.strictEqual(buildozer.add.length, 0);
        assert.strictEqual(buildozer.remove.length, 1);
    });

    test("Should add new bazel dependencies", async () => {
        const documentUri = vscode.Uri.file(path.join(package4, 'test4.ts'));
        const editor = await vscode.window.showTextDocument(documentUri);

        await addLineManually(editor, "import {test3a} from '@test/package3/test3a';");

        await runDepsFix(documentUri);

        const buildozer: StubDozer = StubData.mostRecent();

        assert.strictEqual(buildozer.target, "//ts/src/package3/package4");
        assert.strictEqual(buildozer.remove.length, 0);
        assert(buildozer.add.includes("//ts/src/package3"));
        assert.strictEqual(buildozer.add.length, 1);
    });

    test("Should update bazel deps", async () => {
        
        const documentUri = vscode.Uri.file(path.join(package1, 'test1.ts'));
        const editor = await vscode.window.showTextDocument(documentUri);
        // Delete deps on lines 1 and 2 (package2 and package 3)
        
        await deleteLineManually(editor, 0);
        await deleteLineManually(editor, 0);
        await addLineManually(editor, "import {test5} from '@test/package5/test5';");
        // --run deps analysis
        await runDepsFix(documentUri);

        const buildozer: StubDozer = StubData.mostRecent();

        assert.strictEqual(buildozer.target, "//ts/src/package1");
        assert(buildozer.remove.includes("//ts/src/package3"));
        assert(buildozer.remove.includes("//ts/src/package2"));
        assert.strictEqual(buildozer.remove.length, 2);
        assert(buildozer.add.includes("//ts/src/package5"));
        assert.strictEqual(buildozer.add.length, 1);
    });

    suiteTeardown(async () => {
        await vscode.workspace.saveAll();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await executeCommand("bazel shutdown", testWorkspaceFolder);
        await cleanupWorkspace(testWorkspaceFolder);
    });
});