import * as vscode from 'vscode';
import { FilesContext, TargetInfo } from '../util/bazeltools';

export interface ActiveFileData {
    documentState: string,
    uri: vscode.Uri,
    target: string,
    buildUri: vscode.Uri,
    packageSources: vscode.Uri[],
    context: FilesContext<string, string, TargetInfo>
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