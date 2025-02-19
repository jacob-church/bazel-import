import * as vscode from 'vscode';
import {uriToContainingUri} from './uritools';
import {uriToBuildTarget} from './targettools';

/**
 * Takes a list of file Uris and returns the corresponding build targets
 * @param uris
 * @param currentTarget
 * @returns
 */
export async function getImportedTargets(uris: vscode.Uri[], currentTarget: string): Promise<Set<string>> {
    const depPromises = await Promise.all(
        uris.map((uri) => {
            const dir = uriToContainingUri(uri);
            return uriToBuildTarget(dir);
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