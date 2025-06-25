
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
        this.name = JSON.stringify({
            data: text
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
    data: string
};