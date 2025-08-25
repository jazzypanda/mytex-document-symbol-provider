import * as vscode from 'vscode';

/**
 * 表示文档中一个段落的结构
 */
export interface Paragraph {
    /** 唯一标识符，可以是基于内容的哈希 */
    id: string; 
    /** 段落的纯文本内容 */
    text: string;
    /** 段落在文档中的范围 */
    range: vscode.Range;
    /** LLM生成的总结，可能为空 */
    summary?: string; 
    /** 当前段落的状态 */
    state: 'initial' | 'summarizing' | 'success' | 'failed';
}

/**
 * 缓存一个文档的完整解析状态
 */
export interface DocumentState {
    /** 文档的URI字符串 */
    uri: string;
    /** 文档全文内容的哈希值，用于快速判断是否变更 */
    hash: string;
    /** 文档包含的所有段落 */
    paragraphs: Paragraph[];
}