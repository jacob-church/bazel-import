
import * as vscode from 'vscode'; 

export class MockTerminal implements vscode.Terminal {
    name: string;
    processId!: Thenable<number | undefined>;
    creationOptions!: Readonly<vscode.TerminalOptions | vscode.ExtensionTerminalOptions>;
    exitStatus: vscode.TerminalExitStatus | undefined;
    state!: vscode.TerminalState;
    shellIntegration: vscode.TerminalShellIntegration | undefined;

    constructor() {
        this.name = JSON.stringify({
            data: ""
        });
    }

    sendText(text: string, shouldExecute?: boolean): void {
        const addStr = "buildozer \"add deps ";
        const removeStr = "buildozer \"remove deps ";
        const addIdx = text.indexOf(addStr);
        const endAddIdx = text.indexOf("\"", addIdx + addStr.length);
        const removeIdx = text.indexOf(removeStr);
        const endRemoveIdx =  text.indexOf("\"", removeIdx + removeStr.length);

        const adds = addIdx < 0 ? [] : text.substring(addIdx + addStr.length, endAddIdx).trim().split(' ');
        const removes = removeIdx < 0 ? [] : text.substring(removeIdx + removeStr.length, endRemoveIdx).trim().split(' ');

        this.name = JSON.stringify({
            data: {
                raw: text,
                add: adds,
                remove: removes
            }
        });
    }

    show(preserveFocus?: boolean): void {
        throw new Error('Method not implemented.');
    }

    hide(): void {
        throw new Error('Method not implemented.');
    }

    dispose(): void {
        throw new Error('Method not implemented.');
    }
}

export type MockData = {
    data: {
        raw: string,
        add: string[],
        remove: string[]
    }
};