import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { LlmService } from './LlmService';

// 定义符号的几种可能状态
enum SymbolStateStatus {
    Loading,
    Success,
    Failed
}

interface SymbolInformation {
    name: string;
    range: vscode.Range;
}

interface DocumentSymbolState {
    hash: string;
    status: SymbolStateStatus;
    symbols: SymbolInformation[];
}

export class SymbolStateService {
    private llmService: LlmService;
    private stateCache = new Map<string, DocumentSymbolState>();

    constructor(context: vscode.ExtensionContext) {
        this.llmService = new LlmService(context);
    }

    /**
     * 主入口：获取文档的符号信息。
     * 如果没有缓存或内容已更改，则启动后台更新。
     */
    public getSymbols(document: vscode.TextDocument): DocumentSymbolState {
        const uriString = document.uri.toString();
        const text = document.getText();
        const hash = crypto.createHash('sha256').update(text).digest('hex');

        const currentState = this.stateCache.get(uriString);

        if (currentState && currentState.hash === hash) {
            // 内容未变，直接返回缓存的状态
            return currentState;
        }

        // 内容已变或首次加载，启动更新流程
        const paragraphs = this.parseParagraphs(document);
        
        // 立即返回“加载中”状态
        const loadingState: DocumentSymbolState = {
            hash: hash,
            status: SymbolStateStatus.Loading,
            symbols: paragraphs.map((p, i) => ({
                name: `Paragraph ${i + 1}`, // 基础名称
                range: p.range
            }))
        };
        this.stateCache.set(uriString, loadingState);

        // 在后台启动LLM，不要 await
        this.updateSummariesInBackground(document, hash, paragraphs.map(p => p.text));

        return loadingState;
    }

    private async updateSummariesInBackground(document: vscode.TextDocument, originalHash: string, paragraphs: string[]) {
        const uriString = document.uri.toString();
        try {
            const summaries = await this.llmService.getParagraphSummaries(document.getText(), paragraphs);
            
            const currentState = this.stateCache.get(uriString);
            // 确保在LLM运行时，文档没有被再次修改
            if (currentState && currentState.hash === originalHash) {
                const successState: DocumentSymbolState = {
                    ...currentState,
                    status: SymbolStateStatus.Success,
                    symbols: currentState.symbols.map((symbol, i) => ({
                        ...symbol,
                        name: summaries[i] || symbol.name // 如果LLM返回空，则保留原名
                    }))
                };
                this.stateCache.set(uriString, successState);
                this.triggerRefresh(document.uri);
            }
        } catch (error) {
            const currentState = this.stateCache.get(uriString);
            if (currentState && currentState.hash === originalHash) {
                const failedState: DocumentSymbolState = {
                    ...currentState,
                    status: SymbolStateStatus.Failed
                };
                this.stateCache.set(uriString, failedState);
                this.triggerRefresh(document.uri);
            }
        }
    }

    /**
     * 触发 VS Code 刷新大纲视图
     */
    private triggerRefresh(uri: vscode.Uri) {
        // 通过一个内部命令来执行刷新，保持代码整洁
        vscode.commands.executeCommand('mytex.internal.refreshSymbols', uri);
    }

    private parseParagraphs(document: vscode.TextDocument): { text: string, range: vscode.Range }[] {
        const results = [];
        const text = document.getText();
        const paragraphRegex = /([^\r\n]+(?:.|\r?\n[^\r\n]+)*)/g;
        let match;
        
        while ((match = paragraphRegex.exec(text)) !== null) {
            const paragraphText = match[0].trim();
            if (paragraphText.length > 0) {
                const startPosition = document.positionAt(match.index);
                const endPosition = document.positionAt(match.index + match[0].length);
                results.push({
                    text: paragraphText,
                    range: new vscode.Range(startPosition, endPosition)
                });
            }
        }
        return results;
    }

    // 暴露 status 枚举，以便 Provider 使用
    public static readonly SymbolStateStatus = SymbolStateStatus;
}