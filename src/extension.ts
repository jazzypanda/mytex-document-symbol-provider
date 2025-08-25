import * as vscode from 'vscode';
import { ParsingEngine } from './engine/ParsingEngine';
import { LlmController } from './llm/LlmController';
import { DocumentManager } from './core/DocumentManager';
import { MytexDocumentSymbolProvider } from './providers/MytexDocumentSymbolProvider';
import { setApiKey, clearApiKey } from './utils/Configuration';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "mytex" is now active with the new architecture!');

    // 1. 初始化核心服务
    const parsingEngine = new ParsingEngine();
    const llmController = new LlmController(context);
    const documentManager = new DocumentManager(parsingEngine, llmController);

    // 2. 初始化Provider
    const symbolProvider = new MytexDocumentSymbolProvider(documentManager);

    // 3. 注册Provider
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            { language: 'mytex' },
            symbolProvider
        )
    );

    // 4. 注册一个内部命令，用于连接Manager和Provider
    context.subscriptions.push(
        vscode.commands.registerCommand('mytex.internal.refreshSymbols', () => {
            symbolProvider.forceRefresh();
        })
    );

    // 5. 注册用户可见的公共命令
    context.subscriptions.push(
        vscode.commands.registerCommand('mytex.setApiKey', () => setApiKey(context)),
        vscode.commands.registerCommand('mytex.clearApiKey', () => clearApiKey(context))
    );

    // 6. 注册Manager以便资源清理
    context.subscriptions.push(documentManager);

    console.log('MyTeX Symbol Provider has been registered.');
}

export function deactivate() {}