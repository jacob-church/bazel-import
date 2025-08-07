import * as vscode from 'vscode'; 
import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import { filePathToTargetPath } from './targettools';
import { Cache } from '../model/basecache';
import { showErrorMessage } from '../userinteraction';
import { homedir } from 'os';

const tsExtension = vscode.extensions.getExtension('vscode.typescript-language-features');
let active = true; 
    
if (!tsExtension) {
    showErrorMessage('TypeScript Language Features are not enabled.');
    active = false; 
}

let configCache: Cache<string, ts.ParsedCommandLine> = new Cache<string, ts.ParsedCommandLine>(vscode.workspace.getConfiguration('bazel-import').maxCacheSize);

export function resolveSpecifierToFilePath(
    hostFileUri: vscode.Uri,
    specifier: string
) {
    const configPath = ts.findConfigFile(hostFileUri.fsPath, ts.sys.fileExists, 'tsconfig.json'); // This can also be used for bazel build

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

    return resolved.resolvedModule.resolvedFileName;
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

const BUILD_FILE = vscode.workspace.getConfiguration('bazel-import').buildFile;


export function fpToBuildTarget(fsPath: string) {
    const fileUri = vscode.Uri.file(fsPath);
    const [target, ] = uriToBuild(fileUri) ?? [, ];
    return target;
}

export function fpToBuild(fsPath: string) {
    const fileUri = vscode.Uri.file(fsPath);
    const [, buildUri] = uriToBuild(fileUri) ?? [,];
    return buildUri; 
}

// TODO: consider removing the target logic
export function uriToBuild(fileUri: vscode.Uri): [string, vscode.Uri] | undefined {
    const configPath = ts.findConfigFile(path.dirname(fileUri.fsPath), ts.sys.fileExists, BUILD_FILE);
    if (!configPath) {
        return undefined;
    }

    const rawTarget = filePathToTargetPath(configPath);
    const index = rawTarget?.indexOf(BUILD_FILE) ?? 1;
    const target = rawTarget?.slice(0, index - 1); 
    if (target === undefined) {
        return target;
    }

    const targetUri = vscode.Uri.file(configPath); 

    return [target, targetUri]; 
}

export async function getBuildTargetFromFilePath(importPath: string, currentFile: vscode.Uri): Promise<[string, vscode.Uri]> {
    const filePath = importToFullPath(currentFile, importPath);
    if (filePath === undefined) {
        throw new Error("Bad file path"); 
    }
    const fileUri: vscode.Uri | undefined = vscode.Uri.file(filePath);

    if (!fileUri) {
        throw new Error("File not found");
    }
    const target = uriToBuild(fileUri);
    if (!target) {
        throw new Error("Target not found");
    }
    return target;
};

export function importToFullPath(currentFile: vscode.Uri, importPath: string) {
    let filePath: string | undefined;

    if (importPath.startsWith('.')) {
        filePath = path.resolve(path.dirname(currentFile.fsPath), importPath) + ".ts";
        if (fs.existsSync(filePath)) {
            return filePath;
        }
    }
    filePath = resolveSpecifierToFilePath(currentFile, importPath);

    return filePath;
}

export function fsToRelativePath(fsPath: string) {
    return vscode.workspace.asRelativePath(fsPath);
}

// File system to Workspace Path
export function fsToWsPath(fsPath: string) {
    return '//' + fsToRelativePath(fsPath);
}

function wsToRelativePath(wsPath: string): string {
    return wsPath.substring(2);
}
function wsToFsPath(wsPath: string): string {
    const relativePath = wsToRelativePath(wsPath);
    return getRoot() + relativePath;
}

function bazelLabelToUri(src: string): vscode.Uri {
    const wsPath = src.replace(':', '/');
    const fsPath = wsToFsPath(wsPath);
    return vscode.Uri.file(fsPath);
}

export function bazelLabelToUris(srcs: string[]) {
    return srcs.map(bazelLabelToUri);
}

export function getRoot() {
    const cwd = path.join(homedir(), '/lucid/main/'); // TODO get root; 
    return cwd;
}
