import * as vscode from 'vscode';

const DELETION_DELAY = 10; 

export async function sleep(time = DELETION_DELAY) {
    return new Promise(resolve => setTimeout(resolve, time));
}

export async function deleteLineManually(editor: vscode.TextEditor, lineNumber: number) {
    const line = editor.document.lineAt(lineNumber);

    if (line.isEmptyOrWhitespace) {
        await editor.edit((editBuilder) => {
            editBuilder.delete(line.rangeIncludingLineBreak);
        });
        return;
    }

    for (let i = line.range.end.character; i > 0; i--) {
        const rangeToDelete = new vscode.Range(
            new vscode.Position(lineNumber, i - 1),
            new vscode.Position(lineNumber, i)
        );
        console.error(rangeToDelete);

        await editor.edit((editBuilder) => {
            editBuilder.delete(rangeToDelete);
        });

        // The delay makes the effect visible and ensures event separation.
        await sleep();
    }

    if (editor.document.lineAt(lineNumber).isEmptyOrWhitespace) {
        await editor.edit((editBuilder) => {
            editBuilder.delete(line.rangeIncludingLineBreak);
        });
    }
}

export async function addLineManually(editor: vscode.TextEditor, line: string) {
    for (let i = 0; i < line.length; i++) {
        const char = line.charAt(i);
        await editor.edit(editBuilder => {
            const position = new vscode.Position(0, i);
            editBuilder.insert(position, char);
        });
        await sleep();
    }

    // Newline character
    await editor.edit(editBuilder => {
        const endOfTextPosition = new vscode.Position(0, line.length);
        editBuilder.insert(endOfTextPosition, '\n');
    });
}

