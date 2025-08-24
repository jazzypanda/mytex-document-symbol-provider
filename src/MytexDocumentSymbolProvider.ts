import * as vscode from 'vscode';
import { SymbolStateService } from './SymbolStateService';

export class MytexDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    
    private stateService: SymbolStateService;

    constructor(stateService: SymbolStateService) {
        this.stateService = stateService;
    }
    
    // 注意：这个方法现在是同步的！
    public provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.DocumentSymbol[] {
        
        const state = this.stateService.getSymbols(document);

        // 根据状态渲染不同的名称
        return state.symbols.map(symbolInfo => {
            let displayName = symbolInfo.name;
            switch (state.status) {
                case SymbolStateService.SymbolStateStatus.Loading:
                    displayName = `⏳ ${symbolInfo.name} (parsing...)`;
                    break;
                case SymbolStateService.SymbolStateStatus.Failed:
                    displayName = `⚠️ ${symbolInfo.name} (failed)`;
                    break;
                case SymbolStateService.SymbolStateStatus.Success:
                    // 成功状态下，name 已经是 LLM 的 summary
                    break;
            }
            
            return new vscode.DocumentSymbol(
                displayName,
                'Paragraph',
                vscode.SymbolKind.String,
                symbolInfo.range,
                symbolInfo.range
            );
        });
    }
}