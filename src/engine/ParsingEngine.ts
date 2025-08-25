import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { Paragraph, DocumentState } from '../core/types';

/**
 * 增量解析的结果
 */
export interface IncrementalParseResult {
    newState: DocumentState;
    changedParagraphs: Paragraph[]; // 需要重新发送给LLM的段落
}

export class ParsingEngine {

    /**
     * 对整个文档进行全量解析，生成段落数组
     * @param document VS Code文本文档对象
     * @returns 解析出的段落数组
     */
    public fullParse(document: vscode.TextDocument): Paragraph[] {
        console.log(`[Engine] Performing full parse for ${document.uri.toString()}`);
        const results: Paragraph[] = [];
        const text = document.getText();
        const paragraphRegex = /([^\r\n]+(?:.|\r?\n[^\r\n]+)*)/g;
        let match;
        
        while ((match = paragraphRegex.exec(text)) !== null) {
            const paragraphText = match[0].trim();
            if (paragraphText.length > 0) {
                const startPosition = document.positionAt(match.index);
                const endPosition = document.positionAt(match.index + match[0].length);
                const range = new vscode.Range(startPosition, endPosition);
                
                const id = crypto.createHash('sha256').update(paragraphText).digest('hex');

                results.push({
                    id,
                    text: paragraphText,
                    range,
                    state: 'initial'
                });
            }
        }
        return results;
    }

    /**
     * 根据文本变更信息进行增量解析。
     * 这是一个简化的实现，它会重新解析从第一个变更点开始到文档末尾的所有内容。
     * 虽然不是最优算法，但比全量解析高效得多，且能保证正确性。
     * @param currentState 当前的文档状态
     * @param changes 文本变更事件数组
     * @param newFullText 新的文档全文
     * @returns 更新后的段落数组和被标记为需要重新摘要的段落
     */
    public incrementalParse(
        currentState: DocumentState,
        changes: readonly vscode.TextDocumentContentChangeEvent[],
        document: vscode.TextDocument
    ): IncrementalParseResult {
        console.log(`[Engine] Performing incremental parse for ${document.uri.toString()}`);
        
        // 找到所有变更中最靠前的一个
        const firstChange = changes.reduce((earliest, current) => 
            current.range.start.isBefore(earliest.range.start) ? current : earliest
        );

        // 找到第一个受变更影响的段落的索引
        const firstAffectedIndex = currentState.paragraphs.findIndex(p => 
            p.range.end.isAfterOrEqual(firstChange.range.start)
        );

        if (firstAffectedIndex === -1) {
            // 变更发生在所有段落之后（例如在末尾添加新行）
            // 或者文档为空，直接进行全量解析
            const newParagraphs = this.fullParse(document);
            return {
                newState: { ...currentState, hash: this.calculateHash(document.getText()), paragraphs: newParagraphs },
                changedParagraphs: newParagraphs
            };
        }

        // 保留未受影响的段落
        const preservedParagraphs = currentState.paragraphs.slice(0, firstAffectedIndex);
        
        // 获取需要重新解析的文本区域的起始位置
        const reparseStartPosition = preservedParagraphs.length > 0
            ? preservedParagraphs[preservedParagraphs.length - 1].range.end
            : new vscode.Position(0, 0);

        // 重新解析受影响区域及其之后的所有文本
        const offset = document.offsetAt(reparseStartPosition);
        const remainingText = document.getText().substring(offset);
        
        const newParagraphsPartial: Paragraph[] = [];
        const paragraphRegex = /([^\r\n]+(?:.|\r?\n[^\r\n]+)*)/g;
        let match;

        while ((match = paragraphRegex.exec(remainingText)) !== null) {
            const paragraphText = match[0].trim();
            if (paragraphText.length > 0) {
                const startPosition = document.positionAt(offset + match.index);
                const endPosition = document.positionAt(offset + match.index + match[0].length);
                const range = new vscode.Range(startPosition, endPosition);
                const id = crypto.createHash('sha256').update(paragraphText).digest('hex');
                newParagraphsPartial.push({ id, text: paragraphText, range, state: 'initial' });
            }
        }
        
        const finalParagraphs = [...preservedParagraphs, ...newParagraphsPartial];

        // 找出哪些段落是新增或变更的，需要重新摘要
        const oldParagraphIds = new Set(preservedParagraphs.map(p => p.id));
        const changedParagraphs = newParagraphsPartial.filter(p => {
             // 简单策略：只要是重新解析出来的段落，都认为需要重新获取摘要。
             // 优化点：可以与旧状态中同样范围的段落哈希值对比，如果哈希未变则无需请求。
             // 为简化起见，此处全部标记为变更。
            return !oldParagraphIds.has(p.id);
        });
        
        const newState: DocumentState = {
            uri: document.uri.toString(),
            hash: this.calculateHash(document.getText()),
            paragraphs: finalParagraphs
        };

        console.log(`[Engine] Preserved ${preservedParagraphs.length} paragraphs, re-parsed ${newParagraphsPartial.length}, found ${changedParagraphs.length} changed.`);
        
        return { newState, changedParagraphs };
    }

    private calculateHash(text: string): string {
        return crypto.createHash('sha256').update(text).digest('hex');
    }
}