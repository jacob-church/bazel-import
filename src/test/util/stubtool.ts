import * as util from '../../util/exectools';
import * as vscode from 'vscode';


function stub(obj: any, methodName: string, stubImplementation: ({ 
        addDeps, 
        removeDeps, 
        buildTarget, fileUri }: { 
            addDeps?: string[]; 
            removeDeps?: string[]; 
            buildTarget: string; 
            fileUri: vscode.Uri; 
        }) => Promise<boolean>) {
    originalDescriptor = Object.getOwnPropertyDescriptor(obj, methodName);

    Object.defineProperty(obj, methodName, {
        value: stubImplementation, 
        writable: true,
        configurable: true
    });
}

async function replacer({ addDeps, removeDeps, buildTarget, fileUri }: {
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

let originalDescriptor: PropertyDescriptor | undefined;

export function setupStub() {
    stub(util, 'updateBuildDeps', replacer);
}

export function teardownStub() {
    if (originalDescriptor) {
        Object.defineProperty(util, 'updateBuildDeps', originalDescriptor);
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