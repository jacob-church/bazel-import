import * as vscode from 'vscode'; 
import { getConfig, MAIN_CONFIG } from '../config/config';
import { updateStatusBar } from '../extension';
import { packageTooLarge } from '../util/path/packagetools';
import { CHANGE_PACKAGE_LIMIT_BUTTON } from '../groups/active';

export let MAX_PKG_SIZE: number = getConfig("maxPackageSize"); 

const DISMISS_BUTTON = "Don't show this again";
const OPEN_BUTTON = 'Open';

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
        prompt: `Enter maximum package size (current size: ${getConfig("maxPackageSize")}`,
        validateInput: validateNumber
    }); 

    if (maxSize) {
        await vscode.workspace.getConfiguration(MAIN_CONFIG).update('maxPackageSize', maxSize); 
        vscode.window.showInformationMessage(`New maximum package size: ${getConfig("maxPackageSize")}`);
        MAX_PKG_SIZE = parseInt(maxSize);
    }
    else {
        vscode.window.showInformationMessage(`Operation aborted`);
    }
};

export const showErrorMessage = (message: string, fileUri?: vscode.Uri) => {
    vscode.window
        .showErrorMessage(message, OPEN_BUTTON)
        .then((button) => {
            if (button === OPEN_BUTTON && fileUri) {
                vscode.window.showTextDocument(fileUri);
            }
        });
};

export const showDismissableFileMessage = (message: string, fileUri?: vscode.Uri) => {
    if (!getConfig("notifyChange")) {
        return;
    }
    vscode.window
        .showInformationMessage(message, OPEN_BUTTON, DISMISS_BUTTON)
        .then((button) => {
            if (button === OPEN_BUTTON && fileUri) {
                vscode.window.showTextDocument(fileUri);
            }
            if (button === DISMISS_BUTTON) {
                vscode.workspace.getConfiguration(MAIN_CONFIG).update('notifyChange', false);
            }
        });
};

export const showDismissableMessage = (message: string) => {
    if (!getConfig("notifyChange")) {
        return; 
    }
    vscode.window.showInformationMessage(message);
};

export function setDeletionStatus(fileName: string) {
    const enabledStatus = packageTooLarge() ? "disabled" : "enabled";
    updateStatusBar(
        new vscode.MarkdownString(`Deletions ${enabledStatus} for\n\`${fileName}\``),
        '$(wand)'
    );
}

export function showChangeMaxSize(text: string) {
    vscode.window
        .showWarningMessage(
            text,
            CHANGE_PACKAGE_LIMIT_BUTTON
        ).then((button) => {
            if (button === CHANGE_PACKAGE_LIMIT_BUTTON) {
                updateMaxPackageSize();
            }
        });
}

