import * as vscode from 'vscode'; 
import * as ts from 'typescript';
import * as path from 'path';
import { filePathToTargetPath } from '../targettools';
import { Cache } from './basecache';
import { showErrorMessage } from '../userinteraction';

const tsExtension = vscode.extensions.getExtension('vscode.typescript-language-features');
let active = true; 
    
if (!tsExtension) {
    showErrorMessage('TypeScript Language Features are not enabled.');
    active = false; 
}

let configCache: Cache<string, ts.ParsedCommandLine> = new Cache<string, ts.ParsedCommandLine>(vscode.workspace.getConfiguration('bazel-import').maxCacheSize);

export function resolveSpecifierToUri(
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
        getCurrentDirectory: () => {
            if (specifier.startsWith("@")) {
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

    const parsedConfig = configCache.get(configPath);

    if (parsedConfig === undefined) {
        return undefined;
    }

    const resolved = ts.resolveModuleName(
        specifier,
        hostFileUri.fragment,
        parsedConfig.options,
        moduleResolutionHost
    );

    if (resolved.resolvedModule === undefined) {
        return undefined; 
    }

    return vscode.Uri.file(resolved.resolvedModule.resolvedFileName);
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

export function uriToBuild(uri: vscode.Uri): [string, vscode.Uri] | undefined {
    const configPath = ts.findConfigFile(uri.fsPath, ts.sys.fileExists, BUILD_FILE);
    if (!configPath) {
        return undefined;
    }
    const rawTarget = filePathToTargetPath(configPath);
    const index = rawTarget?.indexOf(BUILD_FILE) ?? 1;

    const target = rawTarget?.slice(0, index - 1); 
    const targetUri = vscode.Uri.file(configPath); 
    if (target === undefined) {
        return target;
    }

    return [target, targetUri]; 
}
