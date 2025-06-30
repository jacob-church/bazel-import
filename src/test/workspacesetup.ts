import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const tempDirPrefix = 'vscode-extension-test-';

export interface WorkspaceInfo {
    testWorkspaceFolder: string,
    package1: string,
    package2: string,
    package3: string,
    package4: string,
    package5: string,
}

export async function setupWorkspace(bazel: boolean = false): Promise<WorkspaceInfo> {
    // Create a temporary directory for each test run to ensure isolation
    const testWorkspaceFolder = fs.mkdtempSync(path.join(os.tmpdir(), tempDirPrefix));
    console.log(`Test workspace: ${testWorkspaceFolder}`);
    const packagesRoot = path.join(testWorkspaceFolder, "ts/src");
    fs.mkdirSync(packagesRoot, {recursive: true});

    if (bazel) {
        const buildModuleContent = getBuildModule();
        fs.writeFileSync(path.join(testWorkspaceFolder, "MODULE.bazel"), buildModuleContent);

        const ruleImplementation = getBuildImpl();
        fs.writeFileSync(path.join(testWorkspaceFolder, 'test.bzl'), ruleImplementation);

        const topBuildFile = "";
        fs.writeFileSync(path.join(testWorkspaceFolder, 'BUILD.bazel'), topBuildFile);
    }

    const rootTsConfigContent = getRootTsConfig();
    fs.writeFileSync(path.join(packagesRoot, 'tsconfig.json'), rootTsConfigContent);
    
    // Build 4 bazel packages 
    // Package 1
    const package1 = path.join(packagesRoot, "package1");
    fs.mkdirSync(package1);
    const build1 = buildContents("package1", ["package2", "package3", "package3/package4"]);
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
    const package2 = path.join(packagesRoot, "package2");
    const sub2 = path.join(package2, "sub2");
    const subsub2 = path.join(sub2, "subsub2"); 
    fs.mkdirSync(subsub2, {recursive: true});
    const build2 = buildContents("package2", ["package3", "package3/package4"]);
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
    const package3 = path.join(packagesRoot, "package3");
    fs.mkdirSync(package3);
    const build3 = buildContents("package3", []); // may need to fix empty deps
    const test3a = "export function test3a() { console.log('test3a'); }";
    const test3b = "export function test3b() { console.log('test3b'); }";
    fs.writeFileSync(path.join(package3, "BUILD.bazel"), build3);
    fs.writeFileSync(path.join(package3, "test3a.ts"), test3a);
    fs.writeFileSync(path.join(package3, "test3b.ts"), test3b);

    // Package 4
    const package4 = path.join(package3, "package4");
    fs.mkdirSync(package4);
    const build4 = buildContents("package4", []);
    const test4 = "export function test4() { console.log('test4'); }";
    fs.writeFileSync(path.join(package4, "BUILD.bazel"), build4);
    fs.writeFileSync(path.join(package4, "test4.ts"), test4);   

    // Package 5
    const package5 = path.join(packagesRoot, "package5");
    fs.mkdirSync(package5);
    const build5 = buildContents("package5", []);
    const test5 = "export function test5() { console.log('test5'); }";
    fs.writeFileSync(path.join(package5, "BUILD.bazel"), build5);
    fs.writeFileSync(path.join(package5, "test5.ts"), test5);   

    return {testWorkspaceFolder, package1, package2, package3, package4, package5};
}

export function cleanupWorkspace(testWorkspaceFolder: string) {
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
}

let isCleanup = false; 

export function cleanupGraceful(signal: string | number, testWorkspaceFolder: string) {
    if (isCleanup) {
        process.exit();
    }
    isCleanup = true; 
    cleanupWorkspace(testWorkspaceFolder);
    const exitCode = typeof signal === "number" ? signal : (signal === 'SIGINT' ? 130 : 143);
    process.exit(exitCode);
}

function buildContents(pkg: string, deps: string[]) {
    return `load("//:test.bzl", "ts_library")

ts_library(
    name = "${pkg}",
    ${deps.length > 0 ? `deps = [
        ${deps.map(dep => '\"/' + path.join('/ts/src', dep) + '\"')}
    ],`: ""}
    visibility = ["//visibility:public"],
)
`;
}

function getRootTsConfig() {
    return JSON.stringify({
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
}

function getBuildModule() {
    return `module(
name = "bazel-import-test"
)`;
}

function getBuildImpl() {
    return `def _test_impl(ctx):
    ctx.actions.write(
        output=ctx.outputs.executable,
        content="#!/bin/sh\\nexit 0",
        is_executable=True
    )
    
    return [
        DefaultInfo(executable=ctx.outputs.executable)
    ]

ts_library = rule(
    implementation = _test_impl,
    attrs = {
        "deps": attr.label_list(),
    }
)`;
}