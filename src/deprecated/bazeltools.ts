import * as vscode from 'vscode';
import { uriToBuild } from '../util/filepathtools';

/**
 * Takes a list of file Uris and returns the corresponding build targets
 * @param uris
 * @param currentTarget
 * @returns
 */
export async function getImportedTargets(uris: vscode.Uri[], currentTarget: string): Promise<Set<string>> {
    const depPromises = await Promise.all(
        uris.map((uri) => {
            return uriToBuild(uri);
        }),
    );
    const depTargets = new Set<string>();
    for (const promise of depPromises) {
        if (promise) {
            const [target, _] = promise;
            if (target !== currentTarget) {
                depTargets.add(target);
            }
        }
    }
    return depTargets;
}