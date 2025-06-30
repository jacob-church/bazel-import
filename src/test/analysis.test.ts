import {setupWorkspace, cleanupWorkspace, cleanupGraceful} from './workspacesetup';
import * as vscode from 'vscode';
import * as path from 'path';
import * as assert from 'assert';
import { setTerminal } from "../extension";
import { MockData, MockTerminal } from "./__mock__/terminal";
import { runDeps } from "../analysis/deps";
import { executeCommand } from '../analysis/bazelutil';

const DELETION_DELAY = 10; 

let testWorkspaceFolder: string;

process.on('SIGINT', () => cleanupGraceful('SIGINT', testWorkspaceFolder));
process.on('SIGTERM', () => cleanupGraceful('SIGTERM', testWorkspaceFolder));
process.on('exit', (code) => cleanupGraceful(code, testWorkspaceFolder));

async function sleep(time = DELETION_DELAY) {
    return new Promise(resolve => setTimeout(resolve, time));
}

async function deleteLineManually(editor: vscode.TextEditor, lineNumber: number) {
    const line = editor.document.lineAt(lineNumber);

    if (line.isEmptyOrWhitespace) {
        await editor.edit((editBuilder) => {
            editBuilder.delete(line.rangeIncludingLineBreak);
        });
        return;
    }

    for (let i = line.range.end.character; i > 0; i--) {
        const rangeToDelete = new vscode.Range(
            new vscode.Position(lineNumber, i - 1),
            new vscode.Position(lineNumber, i)
        );
        console.error(rangeToDelete);

        await editor.edit((editBuilder) => {
            editBuilder.delete(rangeToDelete);
        });

        // The delay makes the effect visible and ensures event separation.
        await sleep();
    }

    if (editor.document.lineAt(lineNumber).isEmptyOrWhitespace) {
        await editor.edit((editBuilder) => {
            editBuilder.delete(line.rangeIncludingLineBreak);
        });
    }
}

async function addLineManually(editor: vscode.TextEditor, line: string) {
    for (let i = 0; i < line.length; i++) {
        const char = line.charAt(i);
        await editor.edit(editBuilder => {
            const position = new vscode.Position(0, i);
            editBuilder.insert(position, char);
        });
        await sleep();
    }

    // Newline character
    await editor.edit(editBuilder => {
        const endOfTextPosition = new vscode.Position(0, line.length);
        editBuilder.insert(endOfTextPosition, '\n');
    });
}

suite("Analyzer", () => {
    

    let package1: string;
    let package2: string;
    let package3: string;
    let package4: string;

    const testTerminal: vscode.Terminal = new MockTerminal();

    suiteSetup(async () => {
        ({testWorkspaceFolder, package1, package2, package3, package4} = await setupWorkspace(true));
    });

    setup(async () => {
        testTerminal.sendText("");
        setTerminal(testTerminal); 
    });

    teardown(async () => {
        testTerminal.sendText("");
        setTerminal(testTerminal); 
    });

    test("Should not do anything with correct deps", async () => {
        const documentUri = vscode.Uri.file(path.join(package3, "test3a.ts"));

        await runDeps(documentUri);

        let emptyTerminal: MockData = JSON.parse(testTerminal.name);

        assert(emptyTerminal.data);
        assert.strictEqual(emptyTerminal.data.add.length, 0);
        assert.strictEqual(emptyTerminal.data.remove.length, 0);
        assert(!emptyTerminal.data.raw);
    });

    test("Should remove unused bazel deps", async () => {
        const documentUri = vscode.Uri.file(path.join(package2, 'sub2', 'test2a.ts'));
        const editor = await vscode.window.showTextDocument(documentUri);

        await deleteLineManually(editor, 4);

        await runDeps(documentUri);

        let buildozer: MockData = JSON.parse(testTerminal.name); 
        
        assert(buildozer.data);
        assert.strictEqual(buildozer.data.add.length, 0);
        assert(buildozer.data.raw.includes("buildozer \"remove deps"));
        assert(buildozer.data.raw.includes("//ts/src/package2")); // Target
        assert(buildozer.data.remove.includes("//ts/src/package3/package4"));
    });

    test("Should add new bazel dependencies", async () => {
        const documentUri = vscode.Uri.file(path.join(package4, 'test4.ts'));
        const editor = await vscode.window.showTextDocument(documentUri);

        await addLineManually(editor, "import {test3a} from '@test/package3/test3a';");

        await runDeps(documentUri);

        const terminalContent: MockData = JSON.parse(testTerminal.name);

        assert.strictEqual(terminalContent.data.remove.length, 0);
        assert(terminalContent.data.add.includes("//ts/src/package3"));
    });

    test("Should update bazel deps", async () => {
        
        setTerminal(testTerminal); // TODO: change to real if test works
        const documentUri = vscode.Uri.file(path.join(package1, 'test1.ts'));
        const editor = await vscode.window.showTextDocument(documentUri);
        // Delete deps on lines 1 and 2 (package2 and package 3)
        
        await deleteLineManually(editor, 0);
        await deleteLineManually(editor, 0);
        await addLineManually(editor, "import {test5} from '@test/package5/test5';");
        // --run deps analysis
        await runDeps(documentUri);

        const terminalContent: MockData = JSON.parse(testTerminal.name);

        assert(terminalContent.data.remove.includes("//ts/src/package3"));
        assert(terminalContent.data.remove.includes("//ts/src/package2"));
        assert.strictEqual(terminalContent.data.remove.length, 2);
        assert(terminalContent.data.add.includes("//ts/src/package5"));
        assert.strictEqual(terminalContent.data.add.length, 1);
    });

    suiteTeardown(async () => {
        console.log("Deleting directory", testWorkspaceFolder);
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await executeCommand("bazel shutdown", testWorkspaceFolder);
        cleanupWorkspace(testWorkspaceFolder);
    });
});