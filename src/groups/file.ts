// Deletes cache entry if package is modified

import { fpToBuild } from "../util/path/filepathtools";
import * as vscode from 'vscode';
import { PkgCache } from "./active";

export async function onCreateOrDeleteFile(event: vscode.FileCreateEvent | vscode.FileDeleteEvent) {
    const pkgString = getBuildUris(event.files);
    let counts = 0;
    for (const pkg of pkgString) {
        if (pkg === undefined) {
            continue;
        }

        counts += PkgCache.delete(pkg) ? 1 : 0;
    }
    console.debug(`Invalidated ${counts} cache entries`); 
}

function getBuildUris(files: readonly vscode.Uri[]) {
    return new Set(files.map((file) => {
        const uri = fpToBuild(file.fsPath); 
        return uri?.toString();
    }));
}