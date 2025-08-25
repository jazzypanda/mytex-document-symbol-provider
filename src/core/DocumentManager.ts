import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { DocumentState } from './types';
import { ParsingEngine, IncrementalParseResult } from '../engine/ParsingEngine';
import { LlmController } from '../llm/LlmController';
import { StorageManager } from './StorageManager';

export class DocumentManager implements vscode.Disposable {
    private stateCache = new Map<string, DocumentState>();
    
    private readonly _onDidStateChange = new vscode.EventEmitter<DocumentState>();
    public readonly onDidStateChange: vscode.Event<DocumentState> = this._onDidStateChange.event;

    private disposables: vscode.Disposable[] = [];

    constructor(
        private parsingEngine: ParsingEngine,
        private llmController: LlmController,
        private storageManager: StorageManager
    ) {
        this.setupEventListeners();
    }

    public getDocumentState(document: vscode.TextDocument): DocumentState | undefined {
        return this.stateCache.get(document.uri.toString());
    }

    public async saveDocumentState(document: vscode.TextDocument) {
        const state = this.stateCache.get(document.uri.toString());
        if (state) {
            await this.storageManager.saveState(state);
        }
    }
    
    private debounceTimers = new Map<string, NodeJS.Timeout>();

    private setupEventListeners(): void {
        vscode.workspace.onDidOpenTextDocument(this.handleOpenDocument, this, this.disposables);
        vscode.workspace.onDidChangeTextDocument(this.handleDocumentChange, this, this.disposables);
        vscode.workspace.onDidCloseTextDocument(this.handleCloseDocument, this, this.disposables);
        vscode.workspace.onDidSaveTextDocument(this.saveDocumentState, this, this.disposables);
    }

    private async handleOpenDocument(document: vscode.TextDocument) {
        if (document.languageId !== 'mytex') return;

        const currentHash = this.calculateHash(document.getText());
        const cachedState = await this.storageManager.loadState(document.uri);

        if (cachedState && cachedState.hash === currentHash) {
            console.log(`[Manager] Loaded valid state from storage for ${document.uri.toString()}`);
            this.stateCache.set(document.uri.toString(), cachedState);
            this._onDidStateChange.fire(cachedState);
        } else {
            console.log(`[Manager] No valid cache, performing full parse for ${document.uri.toString()}`);
            this.triggerFullUpdate(document);
        }
    }

    private handleDocumentChange(event: vscode.TextDocumentChangeEvent) {
        if (event.document.languageId !== 'mytex') return;

        const uriString = event.document.uri.toString();
        if (this.debounceTimers.has(uriString)) {
            clearTimeout(this.debounceTimers.get(uriString)!);
        }

        const timer = setTimeout(() => {
            const currentState = this.stateCache.get(uriString);
            if (currentState) {
                this.triggerIncrementalUpdate(currentState, event.contentChanges, event.document);
            } else {
                this.triggerFullUpdate(event.document);
            }
        }, 500);

        this.debounceTimers.set(uriString, timer);
    }
    
    private triggerFullUpdate(document: vscode.TextDocument) {
        const paragraphs = this.parsingEngine.fullParse(document);
        const hash = this.calculateHash(document.getText());
        const newState: DocumentState = { uri: document.uri.toString(), hash, paragraphs };
        this.processStateUpdate(newState, paragraphs, document);
    }

    private triggerIncrementalUpdate(currentState: DocumentState, changes: readonly vscode.TextDocumentContentChangeEvent[], document: vscode.TextDocument) {
        const { newState, changedParagraphs } = this.parsingEngine.incrementalParse(currentState, changes, document);
        this.processStateUpdate(newState, changedParagraphs, document);
    }

    private async processStateUpdate(newState: DocumentState, paragraphsForLlm: import("./types").Paragraph[], document: vscode.TextDocument) {
        const uriString = document.uri.toString();
        const text = document.getText();

        if (paragraphsForLlm.length === 0) {
            console.log(`[Manager] No paragraphs need summarization for ${uriString}.`);
            this.stateCache.set(uriString, newState);
            this._onDidStateChange.fire(newState);
            return;
        }

        // Update cache with 'summarizing' state for affected paragraphs
        const summarizingState: DocumentState = {
            ...newState,
            paragraphs: newState.paragraphs.map(p => {
                const isTarget = paragraphsForLlm.some(target => target.id === p.id);
                return isTarget ? { ...p, state: 'summarizing' } : p;
            })
        };
        this.stateCache.set(uriString, summarizingState);
        this._onDidStateChange.fire(summarizingState);

        try {
            const summaries = await this.llmController.summarizeParagraphs(paragraphsForLlm, text);
            
            const currentState = this.stateCache.get(uriString);
            if (!currentState || currentState.hash !== newState.hash) {
                console.log(`[Manager] Document changed during summarization. Discarding results for ${uriString}.`);
                return;
            }

            const finalState: DocumentState = {
                ...currentState,
                paragraphs: currentState.paragraphs.map(p => {
                    if (summaries.has(p.id)) {
                        return { ...p, summary: summaries.get(p.id), state: 'success' };
                    }
                    return p;
                })
            };
            
            this.stateCache.set(uriString, finalState);
            this._onDidStateChange.fire(finalState);
            console.log(`[Manager] Successfully updated state for ${uriString}`);

        } catch (error) {
            console.error(`[Manager] Failed to update state for ${uriString}:`, error);
            const currentState = this.stateCache.get(uriString);
            if (currentState && currentState.hash === newState.hash) {
                const failedState: DocumentState = {
                    ...currentState,
                    paragraphs: currentState.paragraphs.map(p => {
                        const isTarget = paragraphsForLlm.some(target => target.id === p.id);
                        return isTarget ? { ...p, state: 'failed' } : p;
                    })
                };
                this.stateCache.set(uriString, failedState);
                this._onDidStateChange.fire(failedState);
            }
        }
    }

    private handleCloseDocument(document: vscode.TextDocument) {
        if (document.languageId === 'mytex') {
            const uriString = document.uri.toString();
            this.stateCache.delete(uriString);
            if (this.debounceTimers.has(uriString)) {
                clearTimeout(this.debounceTimers.get(uriString)!);
                this.debounceTimers.delete(uriString);
            }
        }
    }

    private calculateHash(text: string): string {
        return crypto.createHash('sha256').update(text).digest('hex');
    }

    public dispose() {
        this.disposables.forEach(d => d.dispose());
        this.debounceTimers.forEach(timer => clearTimeout(timer));
        this._onDidStateChange.dispose();
    }
}