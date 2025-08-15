import * as buildozer from '../../util/exec/buildozertools';
import * as bazel from '../../util/exec/bazeltools';
import * as fptools from '../../util/path/filepathtools';
import * as vscode from 'vscode';
import { PkgContext } from '../../model/bazelquery/packagecontext';
import { TargetInfo } from '../../model/bazelquery/targetinfo';

const stubs = new Map<string, PropertyDescriptor>();


function stubKey(obj: any, methodName: string) {
    return obj.toString() + methodName;
}

function stub(obj: any, methodName: string, stubImplementation: (...args: any[]) => any) {
    const originalDescriptor = Object.getOwnPropertyDescriptor(obj, methodName);

    Object.defineProperty(obj, methodName, {
        value: stubImplementation, 
        writable: true,
        configurable: true
    });

    if (originalDescriptor === undefined) {
        return;
    }

    stubs.set(stubKey(obj, methodName), originalDescriptor); 
}

async function replaceUpdateBuildDeps({ addDeps, removeDeps, buildTarget, fileUri }: {
    addDeps?: string[];
    removeDeps?: string[];
    buildTarget: string;
    fileUri: vscode.Uri;
}) {
    if (buildTarget === StubData.clear) {
        StubData.reset();
        return false;
    }
    else {
        StubData.addCall({
            'add': addDeps ?? [],
            'remove': removeDeps ?? [],
            'target': buildTarget
        });
        return true;
    }
};

// Example of what the stubbed function could use
function pathContext(filePath:string) {
    const targetMap = new Map<string, string>();
    const targetInfos = new Map<string, TargetInfo>();
    if (filePath.includes('/ts/src/package1:*')) {
        targetInfos.set(
            '//ts/src/package1:package1',
            {
                name: '//ts/src/package1:package1',
                deps: ['//ts/src/package2:package2', '//ts/src/package3:package3', '//ts/src/package3/package4:package4'],
                srcs: ['//ts/src/package1:test1.ts']
            }
        );
        targetMap.set(
            '//ts/src/package1/test1.ts', 
            '//ts/src/package1:package1'
        );
    }
    return new PkgContext(
        targetMap, 
        targetInfos
    );
}

// TODO: consider replacing bazel queries with stubbed function returning what the bazel queries would return
async function replaceStreamTargetInfosFromFilePaths(filePaths: string[]): Promise<PkgContext> {
    if (filePaths.length === 1){
        return pathContext(filePaths[0]);
    }
    else {
        return new PkgContext();
    }
}

export function setupStubs(workspaceDirectory: string) {
    stub(buildozer, 'updateBuildDeps', replaceUpdateBuildDeps);
    stub(fptools, 'getRoot', () => workspaceDirectory);
    stub(fptools, 'fsToRelativePath', (fsPath: string) => {
        return fsPath.substring(workspaceDirectory.length + 1);
    });
    function replaceFsToWsPath(fsPath: string) {
        return '//' + fsPath.substring(workspaceDirectory.length + 1);
    }
    stub(fptools, 'fsToWsPath', replaceFsToWsPath);
    stub(fptools, 'wsToFsPath', (wsPath: string) => {
        return workspaceDirectory + wsPath.substring(1); 
    });
    stub(fptools, 'pathsToTargets', (importPaths: string[], context: PkgContext) => {
        const targets = new Set<string>();
        for (const importPath of importPaths) {
            const wsPath = replaceFsToWsPath(importPath);
            const target = context.getTarget(wsPath);
            if (target !== undefined) {
                targets.add(target);
            }
        }
        return targets;
    });
    // stub(bazel, 'streamTargetInfosFromFilePaths', replaceStreamTargetInfosFromFilePaths);
}

export function teardownStubs() {
    teardownStub(buildozer, 'updateBuildDeps');
}

function teardownStub(obj: any, methodName: string) {
    const originalDescriptor = stubs.get(stubKey(obj, methodName));
    if (originalDescriptor !== undefined) {
        Object.defineProperty(obj, methodName, originalDescriptor);
    }
}

export class StubData {
    public static clear: string = "clear";

    private static _data: StubDozer[] = [];

    public static reset() {
        this._data = [];
    }

    public static addCall(call: StubDozer) {
        this._data.push(call);
    }

    public static count(): number {
        return this._data.length;
    }

    public static mostRecent(): StubDozer {
        return StubData._data[this._data.length - 1];
    }
}

export type StubDozer = {
    target: string,
    add: string[],
    remove: string[]
};