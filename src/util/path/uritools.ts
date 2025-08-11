import * as vscode from 'vscode';
import { wsToFsPath } from './filepathtools';
import * as path from 'path';
import * as ts from 'typescript';
import { BUILD_FILE } from '../../config/config';

export function uriEquals(uri1: vscode.Uri | undefined, uri2: vscode.Uri | undefined): boolean {
    if (uri1 === undefined || uri2 === undefined) {
        return false; 
    }
    
    return (uri1.toString() === uri2.toString());
}

export function bazelLabelToUri(src: string): vscode.Uri {
    const wsPath = src.replace(':', '/');
    const fsPath = wsToFsPath(wsPath);
    return vscode.Uri.file(fsPath);
}

export function bazelLabelToUris(srcs: string[]) {
    return srcs.map(bazelLabelToUri);
}export function uriToBuild(fileUri: vscode.Uri): vscode.Uri | undefined {
    const configPath = ts.findConfigFile(path.dirname(fileUri.fsPath), ts.sys.fileExists, BUILD_FILE);
    if (!configPath) {
        return undefined;
    }
    const targetUri = vscode.Uri.file(configPath);

    return targetUri;
}

