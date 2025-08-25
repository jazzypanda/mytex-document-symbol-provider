import * as vscode from 'vscode';
import { DocumentState, Paragraph } from './types';

// VSCode Range对象无法直接JSON序列化，需要转换
interface SerializableRange {
    start: { line: number; character: number };
    end: { line: number; character: number };
}

interface SerializableParagraph extends Omit<Paragraph, 'range'> {
    range: SerializableRange;
}

interface SerializableDocumentState extends Omit<DocumentState, 'paragraphs'> {
    paragraphs: SerializableParagraph[];
}

export class StorageManager {

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * 将文档状态序列化并保存到工作区存储中
     */
    public async saveState(state: DocumentState): Promise<void> {
        const serializableState = this.convertToSerializable(state);
        await this.context.workspaceState.update(state.uri, serializableState);
        console.log(`[StorageManager] State saved for ${state.uri}`);
    }

    /**
     * 从工作区存储中加载并反序列化文档状态
     */
    public async loadState(uri: vscode.Uri): Promise<DocumentState | undefined> {
        const uriString = uri.toString();
        const savedData = this.context.workspaceState.get<SerializableDocumentState>(uriString);

        if (savedData) {
            console.log(`[StorageManager] State loaded from cache for ${uriString}`);
            return this.convertToVscodeTypes(savedData);
        }
        
        console.log(`[StorageManager] No cached state found for ${uriString}`);
        return undefined;
    }

    private convertToSerializable(state: DocumentState): SerializableDocumentState {
        return {
            ...state,
            paragraphs: state.paragraphs.map(p => ({
                ...p,
                range: {
                    start: { line: p.range.start.line, character: p.range.start.character },
                    end: { line: p.range.end.line, character: p.range.end.character },
                }
            }))
        };
    }

    private convertToVscodeTypes(data: SerializableDocumentState): DocumentState {
        return {
            ...data,
            paragraphs: data.paragraphs.map(p => ({
                ...p,
                range: new vscode.Range(
                    new vscode.Position(p.range.start.line, p.range.start.character),
                    new vscode.Position(p.range.end.line, p.range.end.character)
                )
            }))
        };
    }
}