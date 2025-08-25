import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { Paragraph } from '../core/types';

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
        // 沿用之前的段落分割逻辑
        const paragraphRegex = /([^\r\n]+(?:.|\r?\n[^\r\n]+)*)/g;
        let match;
        
        while ((match = paragraphRegex.exec(text)) !== null) {
            const paragraphText = match[0].trim();
            if (paragraphText.length > 0) {
                const startPosition = document.positionAt(match.index);
                const endPosition = document.positionAt(match.index + match[0].length);
                const range = new vscode.Range(startPosition, endPosition);
                
                // 使用段落内容哈希作为ID
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
     * TODO: 根据文本变更信息进行增量解析
     * @param currentState 当前的文档状态
     * @param changes 文本变更事件数组
     * @returns 更新后的段落数组
     */
    public incrementalParse(
        currentState: import('../core/types').DocumentState, 
        changes: readonly vscode.TextDocumentContentChangeEvent[]
    ): Paragraph[] {
        // 增量解析逻辑较为复杂，暂时返回空数组作为占位符
        // 在实际实现中，这里需要分析 changes 的范围，并只更新受影响的段落
        console.log('[Engine] Incremental parse is not yet implemented.');
        return [];
    }
}