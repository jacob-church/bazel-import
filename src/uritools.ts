import * as vscode from 'vscode';

/**
 * Simple method to get the directory above the given Uri
 * @param uri current directory (e.g. /a/b/c/d/e)
 * @returns parent directory (e.g. /a/b/c/d)
 */
export function uriToContainingUri(uri: vscode.Uri): vscode.Uri {
    const parts = uri.fsPath.split('/');
    parts.pop();
    return vscode.Uri.joinPath(vscode.Uri.file('/'), ...parts);
}