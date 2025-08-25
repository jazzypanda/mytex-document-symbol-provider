import * as vscode from 'vscode';
import { ParsingEngine } from './engine/ParsingEngine';
import { LlmController } from './llm/LlmController';
import { DocumentManager } from './core/DocumentManager';
import { MytexDocumentSymbolProvider } from './providers/MytexDocumentSymbolProvider';
import { SecretManager } from './core/SecretManager';
import { StorageManager } from './core/StorageManager';
import { PanelViewManager } from './panels/PanelViewManager'; // NEW

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "mytex" is now active with the new architecture!');

    // 1. 初始化核心服务
    const parsingEngine = new ParsingEngine();
    const secretManager = new SecretManager(context);
    const storageManager = new StorageManager(context);
    const llmController = new LlmController(secretManager);
    const documentManager = new DocumentManager(parsingEngine, llmController, storageManager);

    // 2. 初始化UI层
    const symbolProvider = new MytexDocumentSymbolProvider(documentManager);

    // 3. 注册Provider
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            { language: 'mytex' },
            symbolProvider
        )
    );

    // 4. 将UI刷新连接到DocumentManager的状态变更事件
    documentManager.onDidStateChange(state => {
        console.log(`[Extension] Received state change for ${state.uri}, refreshing UI.`);
        // 刷新大纲视图
        symbolProvider.forceRefresh();
        // 刷新Webview面板 (如果存在)
        if (PanelViewManager.currentPanel) {
            // Only update if the state change is for the active document
            if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.toString() === state.uri) {
                PanelViewManager.currentPanel.update(state);
            }
        }
    });

    // 5. 注册用户可见的公共命令
    context.subscriptions.push(
        vscode.commands.registerCommand('mytex.setApiKey', () => secretManager.setApiKey()),
        vscode.commands.registerCommand('mytex.clearApiKey', () => secretManager.clearApiKey()),
        vscode.commands.registerCommand('mytex.showStructurePanel', () => { // NEW
            PanelViewManager.createOrShow(context.extensionUri);
        })
    );
    
    // 当活动编辑器变化时，也尝试更新面板内容
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && editor.document.languageId === 'mytex' && PanelViewManager.currentPanel) {
            const state = documentManager.getDocumentState(editor.document);
            if (state) {
                PanelViewManager.currentPanel.update(state);
            }
        }
    }));


    // 6. 注册Manager以便资源清理
    context.subscriptions.push(documentManager);

    console.log('MyTeX Symbol Provider has been registered.');

    // 7. 检查当前是否有已打开的 mytex 文件，并触发解析
    if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === 'mytex') {
        documentManager['handleOpenDocument'](vscode.window.activeTextEditor.document);
    }
}

export function deactivate() {}