import * as vscode from 'vscode';
import { MytexDocumentSymbolProvider } from './MytexDocumentSymbolProvider';
import { setApiKey, clearApiKey } from './LlmService';
import { SymbolStateService } from './SymbolStateService';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "mytex-document-symbol-provider" is now active!');

    // 1. 创建状态服务的单例
    const symbolStateService = new SymbolStateService(context);

    // 2. 将服务实例注入到 Provider 中
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            { language: 'mytex' },
            new MytexDocumentSymbolProvider(symbolStateService)
        )
    );

    // 3. 注册用于设置密钥的公共命令
    context.subscriptions.push(
        vscode.commands.registerCommand('mytex.setApiKey', () => setApiKey(context)),
        vscode.commands.registerCommand('mytex.clearApiKey', () => clearApiKey(context))
    );

    // 4. 注册用于触发UI刷新的内部命令
    context.subscriptions.push(
        vscode.commands.registerCommand('mytex.internal.refreshSymbols', async (uri: vscode.Uri) => {
            // 找到对应的文本文档
            const document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
            if (!document) return;

            // 创建一个无操作的编辑来触发 VS Code 刷新符号
            const edit = new vscode.WorkspaceEdit();
            const position = new vscode.Position(0, 0);
            edit.insert(document.uri, position, ' ');
            await vscode.workspace.applyEdit(edit);
            
            const deleteEdit = new vscode.WorkspaceEdit();
            deleteEdit.delete(document.uri, new vscode.Range(position, new vscode.Position(0, 1)));
            await vscode.workspace.applyEdit(deleteEdit);
        })
    );
}

export function deactivate() {}