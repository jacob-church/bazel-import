import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os'; 
import { ExtensionState, getState, setTerminal } from '../extension';
import { MockData, MockTerminal } from './__mock__/terminal';

function buildContents(packagesRoot: string, pkg: string, deps: string[]) {
    return `load("@rules_ts//ts:ts.bzl", "ts_library")

ts_library(
    name = "${pkg}",
    ${deps.length > 0 ? `deps = [
        ${deps.map(dep => '\"/' + path.join('/ts/src', dep) + '\"')}
    ],`: ""}
    visibility = ["//visibility:public"],
)
`;
}

async function awaitState(state: ExtensionState) {
    const waiter = new Promise<void>(resolve => {
        let interval = setInterval(() => {
                if (getState() === state) {
                    clearInterval(interval);
                    resolve();
                }
                console.log(`Waiting for ${ExtensionState[state]} with ${ExtensionState[getState()]}`);
            }, 500);
    });
    await waiter; 
}

suite("Deletion", () => {
    // Create a temporary workspace for tests
    let testWorkspaceFolder: string;
    let package1: string;
    let package2: string;
    let package3: string;
    let package4: string;

    const testTerminal: vscode.Terminal = new MockTerminal();
    const tempDirPrefix = 'vscode-extension-test-';

    suiteSetup(async () => {
        // Create a temporary directory for each test run to ensure isolation
        testWorkspaceFolder = fs.mkdtempSync(path.join(os.tmpdir(), tempDirPrefix));
        console.log(`Test workspace: ${testWorkspaceFolder}`);

        // Build root tsconfig with replacements
        const rootTsConfigContent = JSON.stringify({
            compilerOptions: {
                baseUrl: ".",
                paths: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    "@test/*": ["./*"],
                },
                target: "ES2022",
                module: "commonjs",
                lib: ["ES2022", "dom"],
                strict: true,
                esModuleInterop: true,
                rootDirs: ["."]
            },
            include: ["**/*.ts"]
        }, null, 4);
        
        const packagesRoot = path.join(testWorkspaceFolder, "ts/src");
        fs.mkdirSync(packagesRoot, {recursive: true});
        fs.writeFileSync(path.join(packagesRoot, 'tsconfig.json'), rootTsConfigContent);

        // Build 4 bazel packages 
        // Package 1
        package1 = path.join(packagesRoot, "package1");
        fs.mkdirSync(package1);
        const build1 = buildContents(packagesRoot, "package1", ["package2", "package3", "package3/package4"]);
        fs.writeFileSync(path.join(package1, "BUILD.bazel"), build1);
        const test1 = `import { test2 } from '@test/package2/test2';
import { test3a } from '@test/package3/test3a';
import { test4 } from '@test/package3/package4/test4';

export function test1() {
    test2();
    test3a();
    test4();
}
`;
        fs.writeFileSync(path.join(package1, "test1.ts"), test1); 

        // Package 2 
        package2 = path.join(packagesRoot, "package2");
        const sub2 = path.join(package2, "sub2");
        const subsub2 = path.join(sub2, "subsub2"); 
        fs.mkdirSync(subsub2, {recursive: true});
        const build2 = buildContents(packagesRoot, "package2", ["package3", "package3/package4"]);
        fs.writeFileSync(path.join(package2, "BUILD.bazel"), build2);
        const test2 = "export function test2() { console.log('test2'); }";
        fs.writeFileSync(path.join(package2, "test2.ts"), test2);
        const test2a = `import {test2} from '../test2';
import {test2b} from './subsub2/test2b';
import {test3a} from '@test/package3/test3a';
import {test3b} from '@test/package3/test3b';
import {test4} from '@test/package3/package4/test4';

export function test2a() {
    test2();
    test2b();
    test3a();
    test3b();
    test4();
}`;
        fs.writeFileSync(path.join(sub2, "test2a.ts"), test2a);
        const test2b = `import {test2} from '../../test2';
import {test3a} from '@test/package3/test3a';
export function test2b() {
    test3a();
    test2();
}`;
        fs.writeFileSync(path.join(subsub2, "test2b.ts"), test2b);

        // Package 3
        package3 = path.join(packagesRoot, "package3");
        fs.mkdirSync(package3);
        const build3 = buildContents(packagesRoot, "package3", []); // may need to fix empty deps
        const test3a = "export function test3a() { console.log('test3a'); }";
        const test3b = "export function test3b() { console.log('test3b'); }";
        fs.writeFileSync(path.join(package3, "BUILD.bazel"), build3);
        fs.writeFileSync(path.join(package3, "test3a.ts"), test3a);
        fs.writeFileSync(path.join(package3, "test3b.ts"), test3b);

        // Package 4
        package4 = path.join(package3, "package4");
        fs.mkdirSync(package4);
        const build4 = buildContents(packagesRoot, "package4", []);
        const test4 = "export function test4() { console.log('test4'); }";
        fs.writeFileSync(path.join(package4, "BUILD.bazel"), build4);
        fs.writeFileSync(path.join(package4, "test4.ts"), test4);        
    });

    setup(async () => {
        // Mock terminal
        testTerminal.sendText("");
        setTerminal(testTerminal); 
    });

    teardown(async () => {
    
    });

    suiteTeardown( async () => {
        // Close the workspace
        // If you opened a workspace folder, you might need to close it explicitly
        // or rely on `vscode-test` to clean up the launched instance.

        // Clean up the temporary directory
        if (fs.existsSync(testWorkspaceFolder)) {
            try {
                fs.rmSync(testWorkspaceFolder, { recursive: true, force: true });
                console.log(`Cleaned up test workspace: ${testWorkspaceFolder}`);
            } catch (error) {
                console.error(`Failed to delete ${testWorkspaceFolder}`);
                console.error(error);
            }
        }
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
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

        assert(removeOne.data);
        assert(removeOne.data.includes("//ts/src/package2"));
        assert(removeOne.data.includes("//ts/src/package1"));
        assert(!removeOne.data.includes("//ts/src/package3"));
        assert(!removeOne.data.includes("//ts/src/package3/package4"));
        assert(removeOne.data.includes("remove deps")); 

        await editor.edit(editBuilder => {
            const range = new vscode.Range(0, 0, 2, 0);
            editBuilder.delete(range);
        });

        await awaitState(ExtensionState.ready); 

        let removeRemaining: MockData = JSON.parse(testTerminal.name);
        
        assert(removeRemaining.data);
        assert(!removeRemaining.data.includes("//ts/src/package2"));
        assert(removeRemaining.data.includes("//ts/src/package1"));
        assert(removeRemaining.data.includes("//ts/src/package3"));
        assert(removeRemaining.data.includes("//ts/src/package3/package4"));
        assert(removeRemaining.data.includes("remove deps")); 

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

        assert.strictEqual(removedDependences.data, ""); 
    });
});