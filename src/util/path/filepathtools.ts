import * as vscode from 'vscode'; 
import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import { homedir } from 'os';
import { Cache } from '../../model/basecache';
import { getConfig } from '../../config/config';
import { FilesContext } from '../../model/bazelquery/filescontext';
import { TargetInfo } from '../../model/bazelquery/targetinfo';
import { uriToBuild } from './uritools';
import { builtinModules } from 'module';

let configCache: Cache<string, ts.ParsedCommandLine> = new Cache<string, ts.ParsedCommandLine>(getConfig("maxCacheSize"));

export interface PathOrTarget {
    path?: string,
    externalTarget?: string
}

export function resolveSpecifierToFilePath(
    hostFileUri: vscode.Uri,
    specifier: string
): PathOrTarget | undefined {
    const configPath = ts.findConfigFile(hostFileUri.fsPath, ts.sys.fileExists, 'tsconfig.json');

    if (!configPath) {
        return undefined; 
    }

    if (!configCache.has(configPath)) {
        const parsedCommandLine = getConfiguration(configPath);
        if (parsedCommandLine === undefined) {
            return undefined;
        }
        configCache.set(configPath, parsedCommandLine);
    }

    const moduleResolutionHost: ts.ModuleResolutionHost = {
        fileExists: ts.sys.fileExists,
        readFile: ts.sys.readFile,
        directoryExists: ts.sys.directoryExists,
        getCurrentDirectory: () => path.dirname(configPath),
        getDirectories: ts.sys.getDirectories,
        realpath: ts.sys.realpath,
        useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    };

    const parsedConfig = configCache.get(configPath);

    if (parsedConfig === undefined) {
        return undefined;
    }

    const resolved = ts.resolveModuleName(
        specifier,
        hostFileUri.fsPath,
        parsedConfig.options,
        moduleResolutionHost
    );

    if (resolved.resolvedModule === undefined) {
        return undefined; 
    }
    const module = resolved.resolvedModule; 

    if (module.isExternalLibraryImport) {
        if (module.packageId === undefined || builtinModules.includes(module.packageId.name)) {
            return undefined;
        }
        const packageName = "@npm//" + module.packageId.name;
        const indexToCopy = packageName.lastIndexOf('/') + 1;
        const target = packageName + `:${packageName.substring(indexToCopy)}`;

        return {
            externalTarget: target
        };
    }


    return {
        path: resolved.resolvedModule.resolvedFileName
    };
}

function getConfiguration(configPath: string): ts.ParsedCommandLine | undefined {
    const configContent = ts.sys.readFile(configPath);
    if (!configContent) {
        return undefined;
    }
    const { config, error } = ts.parseConfigFileTextToJson(configPath, configContent);
    if (error) {
        console.error(`Error parsing tsconfig file ${configPath}:`);
        return; 
    }
        
    const parsedCommandLine = ts.parseJsonConfigFileContent(
        config,
        ts.sys,
        path.dirname(configPath)
    );

    return parsedCommandLine;
}

export function fpToBuild(fsPath: string) {
    const fileUri = vscode.Uri.file(fsPath);
    const buildUri = uriToBuild(fileUri);
    return buildUri; 
}

export function importToFs(currentFile: vscode.Uri, importPath: string): PathOrTarget | undefined {
    if (importPath.startsWith('.')) {
        const filePath = path.resolve(path.dirname(currentFile.fsPath), importPath) + ".ts";
        if (fs.existsSync(filePath)) {
            return {
                path: filePath
            };
        }
    }
    const pathOrTarget = resolveSpecifierToFilePath(currentFile, importPath);

    return pathOrTarget;
}

export function fsToRelativePath(fsPath: string) {
    return vscode.workspace.asRelativePath(fsPath);
}

// File system to Workspace Path
export function fsToWsPath(fsPath: string) {
    return '//' + fsToRelativePath(fsPath);
}

export function wsToRelativePath(wsPath: string): string {
    return wsPath.substring(2);
}
export function wsToFsPath(wsPath: string): string {
    const relativePath = wsToRelativePath(wsPath);
    return path.join(getRoot(), relativePath);
}

export function getRoot() {
    const wsd = vscode.workspace.workspaceFolders?.[0].uri.fsPath;

    if (wsd !== undefined) {
        return wsd;
    }
    
    const rootFromConfig = getConfig("defaultRoot"); 
    const root = path.join(homedir(), rootFromConfig);
    return root; 
}

export function pathsToTargets(importPaths: string[], context: FilesContext<string, string, TargetInfo>): Set<string> {
    const targets = new Set<string>();
    for (const importPath of importPaths) {
        const wsPath = fsToWsPath(importPath);
        const target = context.getTarget(wsPath);
        if (target !== undefined) {
            targets.add(target);
        }
    }
    return targets;
}

