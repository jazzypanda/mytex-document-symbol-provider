import * as vscode from 'vscode';
import { MytexDocumentSymbolProvider } from './MytexDocumentSymbolProvider';
import { setApiKey, clearApiKey } from './LlmService';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "mytex-document-symbol-provider" is now active!');

    // 注册 DocumentSymbolProvider
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            { language: 'mytex' },
            new MytexDocumentSymbolProvider(context)
        )
    );

    // 注册命令
    context.subscriptions.push(
        vscode.commands.registerCommand('mytex.setApiKey', () => {
            setApiKey(context);
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('mytex.clearApiKey', () => {
            clearApiKey(context);
        })
    );
}

export function deactivate() {}