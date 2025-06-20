import * as vscode from 'vscode';
import { Cache } from './basecache';
import {getActiveFile, getStatusBarItem, loadSourcePackages, setActiveFile, shouldUpdatePackages, TS_LANGUAGE_ID} from './extension';

const CACHE_SIZE: number = Number(vscode.workspace.getConfiguration('bazel-import').maxCacheSize);
const cache = new Cache<ActiveKey,ActiveData>(CACHE_SIZE);

export interface ActiveKey {
    target: string;
}

export interface ActiveData {
    packageSources: Set<string>, // Uri string representation
    buildUri: vscode.Uri;
}

function urisFromStrings(strings: string[]): vscode.Uri[] {
    return strings.map(strUri => vscode.Uri.parse(strUri)); 
}

export async function updateActiveEditor(editor: vscode.TextEditor | undefined) {
    const statusItem = getStatusBarItem();

    if (editor === undefined) {
        return; 
    }

    const document = editor.document; 
    
    if (document.languageId !== TS_LANGUAGE_ID) {
        statusItem.text = '$(eye-closed)';
        statusItem.tooltip = new vscode.MarkdownString('Bazel import deletion only works with `typescript` files'); 
        return;
    }

    statusItem.text = '$(loading~spin)';
    statusItem.tooltip = `Loading packages for deletion analysis. Current package size is ${vscode.workspace.getConfiguration('bazel-import').maxPackageSize}`; 
    statusItem.show(); 

    const newDir = shouldUpdatePackages(document); // TODO: rename? 
    if (newDir === undefined) {
        statusItem.text = '$(wand)';
        statusItem.tooltip = 'Deletions enabled'; 
        return; 
    }
    let activeFile = getActiveFile();  

    let found = false; 
    for (const {key, value} of cache) {
        if (value?.packageSources.has(document.uri.toString())) {
            const packageSources = urisFromStrings(Array.from(value.packageSources)); // Save to package sources in extension.ts
            const buildUri = value.buildUri; 
            const target = key;
            setActiveFile({
                packageSources: packageSources,
                buildUri: buildUri,
                target: target.target, 
                documentState: document.getText(),
                uri: document.uri,
            });            
            found = true; 
            // update the lru cache ordering because iterating the cache does not update ordering
            cache.get(key); 
            break; 
        }
    }
    if (!found) {
        await loadSourcePackages(document); // Add to cache
        
    }

    activeFile = getActiveFile(); 
    if (activeFile === undefined) {
        throw Error("Unexpected null active file"); 
    }
    cache.set({
        target: activeFile.target,
    }, {
        packageSources: new Set(activeFile.packageSources.map(src => src.toString())), 
        buildUri: activeFile.buildUri,
    });

    statusItem.text = '$(wand)';
    statusItem.tooltip = 'Deletions enabled'; 
}