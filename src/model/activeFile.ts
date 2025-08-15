import * as vscode from 'vscode';
import { TargetInfo } from './bazelquery/targetinfo';
import { PkgContext } from './bazelquery/packagecontext';

export interface ActiveFileData {
    documentState: string,
    uri: vscode.Uri,
    target: string,
    buildUri: vscode.Uri,
    packageSources: vscode.Uri[],
    context: PkgContext
}

export class ActiveFile  {
    private static _data: ActiveFileData;

    public static get data(): ActiveFileData {
        return ActiveFile._data;
    }
    public static set data(value: ActiveFileData) {
        ActiveFile._data = value;
    }
}