import * as vscode from 'vscode';
import { DocumentManager } from '../core/DocumentManager';
import { DocumentState, Paragraph } from '../core/types';

export class MytexDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    
    constructor(private documentManager: DocumentManager) {}

    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    public readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

    /**
     * 由外部命令调用，以触发UI刷新
     */
    public forceRefresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DocumentSymbol[]> {
        
        const state: DocumentState | undefined = this.documentManager.getDocumentState(document);

        if (!state) {
            return [new vscode.DocumentSymbol(
                '⏳ Parsing document...',
                'Please wait',
                vscode.SymbolKind.String,
                new vscode.Range(0, 0, 0, 0),
                new vscode.Range(0, 0, 0, 0)
            )];
        }

        return state.paragraphs.map(p => this.convertParagraphToSymbol(p));
    }

    private convertParagraphToSymbol(paragraph: Paragraph): vscode.DocumentSymbol {
        let displayName: string;
        switch (paragraph.state) {
            case 'summarizing':
                displayName = `⏳ Summarizing...`;
                break;
            case 'success':
                displayName = paragraph.summary || '✅ Summary completed';
                break;
            case 'failed':
                displayName = `⚠️ Summarization failed`;
                break;
            case 'initial':
            default:
                // Fallback for initial state or unexpected values
                displayName = `Paragraph (id: ${paragraph.id.substring(0, 6)})`;
                break;
        }
        
        return new vscode.DocumentSymbol(
            displayName,
            paragraph.text.substring(0, 70) + '...', // detail
            vscode.SymbolKind.String,
            paragraph.range,
            paragraph.range
        );
    }
}