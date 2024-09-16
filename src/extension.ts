import * as vscode from 'vscode';
import {uriToContainingUri} from './uritools';
import {uriToBuildTarget} from './targettools';

const OPEN_BUTTON = 'Open';
const DISMISS_BUTTON = "Don't show this again";

let terminal: vscode.Terminal | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {
    vscode.workspace.onDidChangeTextDocument(async (changeEvent: vscode.TextDocumentChangeEvent) => {
        const targets = new Set();
        let currentTarget: string | undefined;
        let buildFileUri: vscode.Uri | undefined;

        // Step 1: Find symbol position for dependency lookup and external build targets (e.g. @angule/core)
        const [positions, externalTargets] = positionsFromTextChanges(changeEvent.contentChanges);
        externalTargets.forEach((val) => targets.add(val));
        if (positions.length + externalTargets.size === 0) {
            return;
        }

        // Step 2: Determine the current build target (e.g. where are we adding new dependencies to?)
        const currentUri = uriToContainingUri(changeEvent.document.uri);
        const currentTargetPair = await uriToBuildTarget(currentUri);
        currentTarget = currentTargetPair?.[0];
        buildFileUri = currentTargetPair?.[1];
        if (!currentTarget) {
            return;
        }

        // Step 3: Lookup Symbols and find the file paths where they are defined
        const uris = await urisFromTextChanges(positions, changeEvent.document.uri);
        if (uris.length === 0) {
            return;
        }

        // Step 4: Convert file paths to relevant build targets
        const depTargets = await getImportedTargets(uris, currentTarget);
        depTargets.forEach((val) => targets.add(val));
        if (targets.size === 0) {
            return;
        }

        // Step 5: Do the update
        if (!terminal) {
            terminal = vscode.window.createTerminal({
                hideFromUser: true,
                isTransient: true,
            });
        }
        const deps = Array.from(targets).join(' ');
        const buildozer = `buildozer "add deps ${deps}" "${currentTarget}"`;
        console.log(`Executing: ${buildozer}`);
        terminal.sendText(buildozer);
        if (vscode.workspace.getConfiguration('bazel-import').notifyChange) {
            const buildFile = vscode.workspace.getConfiguration('bazel-import').buildFile;
            vscode.window
                .showInformationMessage(`Bazel deps added to ${buildFile}`, OPEN_BUTTON, DISMISS_BUTTON)
                .then((button) => {
                    if (button === OPEN_BUTTON && buildFileUri) {
                        vscode.window.showTextDocument(buildFileUri);
                    }
                    if (button === DISMISS_BUTTON) {
                        vscode.workspace.getConfiguration('bazel-import').update('notifyChange', false);
                    }
                });
        }
    });
}

/**
 * Takes the current text changes and reduces them to a list of Uri's to imported dependencies
 * @param positions
 * @param docUri
 * @returns
 */
async function urisFromTextChanges(positions: vscode.Position[], docUri: vscode.Uri): Promise<vscode.Uri[]> {
    const maybeUris = await Promise.all(
        positions.map(async (position) => {
            const locations: (vscode.Location | vscode.LocationLink)[] = await vscode.commands.executeCommand(
                'vscode.executeDefinitionProvider',
                docUri,
                position,
            );
            if (locations.length) {
                const location = locations[0];
                const depUri = location instanceof vscode.Location ? location.uri : location.targetUri;
                return depUri;
            }
        }),
    );
    return maybeUris.filter((uri) => !!uri) as vscode.Uri[];
}

/**
 * Reduce text changes to the cursor positions that can be used for finding original symbol definitions
 */
function positionsFromTextChanges(
    contentChanges: readonly vscode.TextDocumentContentChangeEvent[],
): [vscode.Position[], Set<string>] {
    const positions: vscode.Position[] = [];
    const targets = new Set<string>();

    for (const change of contentChanges) {
        if (change.text === '') {
            continue;
        }

        const [singleLineRegex, endLineRegex] = pathPrefixRegex();
        const allImports = splitOnImports(change.text);
        let offset = 0; // keep track of where our imported symbols are in relation to the range of this chunk of text

        const externalTargets = vscode.workspace.getConfiguration('bazel-import').externalTargets;

        for (const maybeImport of allImports) {
            // "easy" match; new import statements
            if (maybeImport.startsWith('import')) {
                const lines = maybeImport.split('\n');
                // splitting by newline can add junk empty strings
                while (lines[lines.length - 1] === '') {
                    lines.pop();
                }

                // we only need one symbol per import statement in order to fetch the right dependency
                if (lines.length === 1) {
                    // single line import
                    const match = singleLineRegex.exec(lines[0]);
                    const symbols = match && match.length > 1 && match[1];
                    // if one of our external targets is found, stash its corresponding target
                    if (match && match.length > 2 && match[2] in externalTargets) {
                        targets.add(externalTargets[match[2]]);
                    } else {
                        // snag the position of the first symbol for looking up other build targets
                        symbols &&
                            positions.push(
                                new vscode.Position(change.range.start.line + offset, lines[0].indexOf(symbols)),
                            );
                    }
                } else {
                    // multi-line import
                    const match = endLineRegex.exec(lines[lines.length - 1]);
                    if (match) {
                        if (match.length > 1 && match[1] in externalTargets) {
                            targets.add(externalTargets[match[1]]);
                        } else {
                            positions.push(
                                new vscode.Position(
                                    change.range.start.line + offset + 1,
                                    lines[1].length - lines[1].trimStart().length,
                                ),
                            );
                        }
                    }
                }
                offset += lines.length;
            } else {
                // no work needed! Think about it, if you've added a line to an _existing_ import, then the dependency has
                // _already_ been added and if the edit is not part of an import, we _extra_ don't care! Have a nice day.
                offset += maybeImport.split('\n').length;
            }
        }
    }
    return [positions, targets];
}

function pathPrefixRegex(): [RegExp, RegExp] {
    const pathPrefixes = pathPrefixFromConfig();
    const singleLineRegex = new RegExp(`^import {\\s*(.*)\\s*} from '(${pathPrefixes}).*`, 'g');
    const endLineRegex = new RegExp(`^} from '(${pathPrefixes}).*`);
    return [singleLineRegex, endLineRegex];
}

/**
 * Generate RegExp component string for catching relevant import paths
 * @returns
 */
function pathPrefixFromConfig(): string {
    const pathPrefixes = vscode.workspace.getConfiguration('bazel-import').importPathPrefixes;
    if (pathPrefixes.length === 0) {
        return '';
    }

    const prefixes = Object.keys(vscode.workspace.getConfiguration('bazel-import').externalTargets);

    if (typeof pathPrefixes === 'string') {
        prefixes.push(pathPrefixes);
    } else {
        prefixes.push(...pathPrefixes);
    }

    if (prefixes.length === 1) {
        return prefixes[0];
    }
    return `${prefixes.join('|')}`;
}

/**
 * Big sigh about this method... but it was the quick and dirty way
 */
function splitOnImports(text: string) {
    const imports = text.split('import');
    if (imports.length === 1) {
        return imports;
    }
    return imports.filter((piece) => piece !== '').map((piece) => 'import' + piece);
}

/**
 * Recursively search up the file tree to the nearest BUILD.bazel file
 * and return the build target path
 */
async function uriToBuildTarget(uri: vscode.Uri): Promise<[string, vscode.Uri] | undefined> {
    const files = await vscode.workspace.fs.readDirectory(uri);
    const buildFileName = vscode.workspace.getConfiguration('bazel-import').buildFile;
    if (files.some(([name]) => name === buildFileName)) {
        const targetPath = filePathToTargetPath(uri.fsPath);
        const buildUri = vscode.Uri.joinPath(uri, buildFileName);
        if (targetPath) {
            return [targetPath, buildUri];
        }
        return undefined;
    }
    return uriToBuildTarget(uriToContainingUri(uri));
}

/**
 * @param path e.g. /home/<dev>/lucid/main/<target-prefix>/blah/blah/blah
 *      <target-prefix> values can be defined in bazel-import.targetPrefixes
 * @returns e.g. //<target-prefix>/blah/blah/blah
 */
function filePathToTargetPath(path: string): string | undefined {
    const targetPrefixes = vscode.workspace.getConfiguration('bazel-import').targetPrefixes;
    let index = -1;
    if (typeof targetPrefixes === 'string') {
        index = path.indexOf(targetPrefixes);
    } else if (targetPrefixes !== null) {
        for (let i = 0; i < targetPrefixes.length; i++) {
            const newIndex = path.indexOf(targetPrefixes[i]);
            if (newIndex !== -1) {
                index = newIndex;
                break;
            }
        }
    }
    if (index === -1) {
        return undefined;
    }
    return `/${path.substring(index)}`;
}

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

export function deactivate() {
    terminal?.dispose();
}
