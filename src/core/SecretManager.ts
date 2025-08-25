import * as vscode from 'vscode';

const SECRET_KEY = 'mytex.llm.apiKey';

export class SecretManager {

    constructor(private context: vscode.ExtensionContext) {}

    public async getApiKey(): Promise<string | undefined> {
        return await this.context.secrets.get(SECRET_KEY);
    }

    public async setApiKey() {
        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your MyTeX LLM API Key',
            password: true,
            ignoreFocusOut: true,
        });
        if (apiKey) {
            await this.context.secrets.store(SECRET_KEY, apiKey);
            vscode.window.showInformationMessage('MyTeX LLM API Key has been set.');
        }
    }

    public async clearApiKey() {
        await this.context.secrets.delete(SECRET_KEY);
        vscode.window.showInformationMessage('MyTeX LLM API Key has been cleared.');
    }
}