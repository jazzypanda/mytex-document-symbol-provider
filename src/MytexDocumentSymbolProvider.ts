import * as vscode from 'vscode';
import { LlmService } from './LlmService';
import * as crypto from 'crypto';

interface CachedSymbols {
    hash: string;
    symbols: vscode.DocumentSymbol[];
}

export class MytexDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    
    private llmService: LlmService;
    private cache = new Map<string, CachedSymbols>();

    constructor(context: vscode.ExtensionContext) {
        this.llmService = new LlmService(context);
    }
    
    public async provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.DocumentSymbol[]> {
        
        const text = document.getText();
        const contentHash = crypto.createHash('sha256').update(text).digest('hex');

        // 1. 检查缓存
        const cached = this.cache.get(document.uri.toString());
        if (cached && cached.hash === contentHash) {
            return cached.symbols;
        }

        // 2. 本地快速解析段落范围
        const { ranges, paragraphs } = this.parseParagraphs(document);
        if (paragraphs.length === 0) {
            return [];
        }

        try {
            // 3. 异步调用 LLM 获取命名
            vscode.window.setStatusBarMessage('$(sync~spin) MyTeX: Summarizing paragraphs with LLM...', 2000);
            const summaries = await this.llmService.getParagraphSummaries(text, paragraphs);
            
            // 4. “缝合”范围和命名
            const symbols = this.createSymbols(document, ranges, summaries);
            
            // 5. 更新缓存
            this.cache.set(document.uri.toString(), { hash: contentHash, symbols });
            vscode.window.setStatusBarMessage('$(check) MyTeX: Summaries loaded.', 2000);
            
            return symbols;
        } catch (error) {
            // 6. 优雅降级
            console.warn('LLM summarization failed. Falling back to default naming.');
            const fallbackNames = paragraphs.map((_, i) => `Paragraph ${i + 1}`);
            const symbols = this.createSymbols(document, ranges, fallbackNames);
            // 仍然缓存降级结果，避免在内容不变的情况下反复请求失败的 API
            this.cache.set(document.uri.toString(), { hash: contentHash, symbols });
            return symbols;
        }
    }

    private parseParagraphs(document: vscode.TextDocument): { ranges: vscode.Range[], paragraphs: string[] } {
        const ranges: vscode.Range[] = [];
        const paragraphs: string[] = [];
        const text = document.getText();
        
        const paragraphRegex = /([^\r\n]+(?:.|\r?\n[^\r\n]+)*)/g;
        let match;
        
        while ((match = paragraphRegex.exec(text)) !== null) {
            const paragraphText = match[0].trim();
            if (paragraphText.length > 0) {
                paragraphs.push(paragraphText);
                const startPosition = document.positionAt(match.index);
                const endPosition = document.positionAt(match.index + match[0].length);
                ranges.push(new vscode.Range(startPosition, endPosition));
            }
        }
        return { ranges, paragraphs };
    }

    private createSymbols(document: vscode.TextDocument, ranges: vscode.Range[], names: string[]): vscode.DocumentSymbol[] {
        const symbols: vscode.DocumentSymbol[] = [];
        for (let i = 0; i < Math.min(ranges.length, names.length); i++) {
            const range = ranges[i];
            const name = names[i];
            symbols.push(
                new vscode.DocumentSymbol(
                    name,
                    'Paragraph',
                    vscode.SymbolKind.String,
                    range,
                    range
                )
            );
        }
        return symbols;
    }
}