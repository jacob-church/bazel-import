import * as vscode from 'vscode'; 
import * as ts from 'typescript';
import path = require('path');
import { filePathToTargetPath } from '../targettools';

const tsExtension = vscode.extensions.getExtension('vscode.typescript-language-features');
let active = true; 
    
if (!tsExtension) {
    vscode.window.showErrorMessage('TypeScript Language Features extension is not enabled.');
    active = false; 
}

export function resolveModuleToUri(
    hostFileUri: vscode.Uri,
    moduleSpecifier: string
) {
    const configPath = ts.findConfigFile(hostFileUri.fsPath, ts.sys.fileExists, 'tsconfig.json'); // This can also be used for bazel build

    if (!configPath) {
        return undefined; 
    }

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

    const moduleResolutionHost: ts.ModuleResolutionHost = {
        fileExists: ts.sys.fileExists,
        readFile: ts.sys.readFile,
        directoryExists: ts.sys.directoryExists,
        getCurrentDirectory: () => {
            if (moduleSpecifier.startsWith("@")) {
                return path.dirname(configPath);
            }
            else {
                return hostFileUri.fsPath;
            }
        },
        getDirectories: ts.sys.getDirectories,
        realpath: ts.sys.realpath,
        useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    };

    const resolved = ts.resolveModuleName(
        moduleSpecifier,
        hostFileUri.fragment,
        parsedCommandLine.options,
        moduleResolutionHost
    );

    if (resolved.resolvedModule === undefined) {
        throw Error(`Failed to resolve uri: ${moduleSpecifier}`); 
    }

    return vscode.Uri.file(resolved.resolvedModule.resolvedFileName);
}

export function uriToBuild(uri: vscode.Uri): [string, vscode.Uri] | undefined {
    const configPath = ts.findConfigFile(uri.fsPath, ts.sys.fileExists, vscode.workspace.getConfiguration('bazel-import').buildFile);
    if (!configPath) {
        return undefined;
    }
    const rawTarget = filePathToTargetPath(configPath);
    const index = rawTarget?.indexOf(vscode.workspace.getConfiguration('bazel-import').buildFile) ?? 1;

    const target = rawTarget?.slice(0, index - 1); 
    const targetUri = vscode.Uri.file(configPath); 
    if (target === undefined) {
        return target;
    }

    return [target, targetUri]; 
}