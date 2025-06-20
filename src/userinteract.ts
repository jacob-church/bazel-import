import * as vscode from 'vscode'; 

const validateNumber = (text: string) => {
    if (!text || text.trim().length === 0) {
        return 'Input cannot be empty.';
    }

    const num = Number(text);

    if (isNaN(num)) {
        return 'Please enter a valid number.';
    }

    if (!Number.isInteger(num)) {
        return 'Please enter a whole integer, not a decimal.';
    }

    if (num <= 0) {
        return 'Please enter a number greater than zero.';
    }
    
    return undefined;
};

export const updateMaxPackageSize = async () => {
    const maxSize = await vscode.window.showInputBox({
        placeHolder: "New size",
        prompt: `Enter maximum package size (current size: ${vscode.workspace.getConfiguration('bazel-import').maxPackageSize}`,
        validateInput: validateNumber
    }); 

    if (maxSize) {
        await vscode.workspace.getConfiguration('bazel-import').update('maxPackageSize', maxSize); 
        vscode.window.showInformationMessage(`New maximum package size: ${vscode.workspace.getConfiguration('bazel-import').maxPackageSize}`);
    }
    else {
        vscode.window.showInformationMessage(`Operation aborted`);
    }
};