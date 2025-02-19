import * as vscode from 'vscode';
/**
 * Takes the current text changes and reduces them to a list of Uri's to imported dependencies
 * @param positions
 * @param docUri
 * @returns
 */
export async function urisFromTextChanges(positions: vscode.Position[], docUri: vscode.Uri): Promise<vscode.Uri[]> {
    const maybeUris = await Promise.all(
        positions.map(async (position) => {
            const locations: (vscode.Location | vscode.LocationLink)[] = await vscode.commands.executeCommand(
                'vscode.executeTypeDefinitionProvider',
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

const [SINGLE_LINE_REGEX, END_LINE_REGEX] = pathPrefixRegex();
const EXTERNAL_TARGETS = vscode.workspace.getConfiguration('bazel-import').externalTargets;

/**
 * Reduce text changes to the cursor positions that can be used for finding original symbol definitions
 */
export function positionsFromTextChanges(
    contentChanges: readonly vscode.TextDocumentContentChangeEvent[],
): [vscode.Position[], Set<string>] {
    const positions: vscode.Position[] = [];
    const targets = new Set<string>();

    for (const change of contentChanges) {
        if (change.text === '') {
            continue;
        }

        const allImports = splitOnImports(change.text);
        let offset = 0; // keep track of where our imported symbols are in relation to the range of this chunk of text

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
                    const match = SINGLE_LINE_REGEX.exec(lines[0]);
                    const path = match && match.length > 2 && match[2];
                    // if one of our external targets is found, stash its corresponding target
                    if (match && match.length > 3 && match[3] in EXTERNAL_TARGETS) {
                        targets.add(EXTERNAL_TARGETS[match[3]]);
                    } else {
                        // snag the position of the module path for looking up other build targets
                        path &&
                            positions.push(
                                new vscode.Position(change.range.start.line + offset, lines[0].indexOf(path)),
                            );
                    }
                } else {
                    // multi-line import
                    const match = END_LINE_REGEX.exec(lines[lines.length - 1]);
                    const path = match && match.length > 1 && match[1];
                    if (match) {
                        if (match.length > 2 && match[2] in EXTERNAL_TARGETS) {
                            targets.add(EXTERNAL_TARGETS[match[2]]);
                        } else {
                            path && positions.push(
                                new vscode.Position(
                                    change.range.start.line + offset + (lines.length - 1), // get to last line
                                    lines[lines.length - 1].indexOf(path), // get to import path
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
    const singleLineRegex = new RegExp(`^import {\\s*(.*)\\s*} from '((${pathPrefixes}).*)`, 'g');
    const endLineRegex = new RegExp(`^} from '((${pathPrefixes}).*)`);
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