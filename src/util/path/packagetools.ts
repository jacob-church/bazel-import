import * as vscode from 'vscode';
import * as path from 'path';
import {ActiveFile} from '../../model/activeFile';
import {MAX_PKG_SIZE} from '../../ui/userinteraction';
import {getFullPathsFromFile} from '../filetext/importtools';
import { FilesContext } from '../../model/bazelquery/filescontext';
import { TargetInfo } from '../../model/bazelquery/targetinfo';
import { streamTargetInfosFromFilePaths } from '../exec/bazeltools';
import { fsToWsPath } from './filepathtools';
import { bazelLabelToUris } from './uritools';

export async function getImportPathsFromPackage(packageSources: vscode.Uri[]): Promise<[string[], string[]]> {
    const importsAndTargets = await Promise.all(packageSources.map(async uri => getFullPathsFromFile(uri!)));
    const externalTargets = [];
    const paths = [];
    for (const [path, target] of importsAndTargets) {
        externalTargets.push(...target);
        paths.push(...path);
    }
    return [paths, externalTargets];
} 

export function packageTooLarge(): boolean {
    return (ActiveFile.data.packageSources.length ?? MAX_PKG_SIZE + 1) > MAX_PKG_SIZE;
}

function uriToPkgString(uri: vscode.Uri) {
    const fsPath = uri.fsPath;
    const pkgDir = path.dirname(fsPath);
    if (pkgDir.endsWith('/')) {
        return pkgDir.slice(0, pkgDir.length - 1) + ':*';
    }
    return pkgDir + ':*';
}

export async function loadPackageSources(fileUri: vscode.Uri, buildUri: vscode.Uri): Promise<[FilesContext<string, string, TargetInfo>, vscode.Uri[], string] | undefined> {
    const pkgString = uriToPkgString(buildUri);
    const context = await streamTargetInfosFromFilePaths([pkgString]);

    const wsPath = fsToWsPath(fileUri.fsPath);
    const info = context.getInfo(wsPath);

    if (info === undefined) {
        return undefined; 
    }

    const packageSources = bazelLabelToUris(info.srcs);

    return [context, packageSources, info.name];
}
;
