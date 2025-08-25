import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { DocumentState, Paragraph } from './types';
import { ParsingEngine } from '../engine/ParsingEngine';
import { LlmController } from '../llm/LlmController';

export class DocumentManager implements vscode.Disposable {
    private stateCache = new Map<string, DocumentState>();
    private parsingEngine: ParsingEngine;
    private llmController: LlmController;

    private disposables: vscode.Disposable[] = [];

    constructor(parsingEngine: ParsingEngine, llmController: LlmController) {
        this.parsingEngine = parsingEngine;
        this.llmController = llmController;
        this.setupEventListeners();
    }

    public getDocumentState(document: vscode.TextDocument): DocumentState | undefined {
        const uriString = document.uri.toString();
        const cachedState = this.stateCache.get(uriString);
        
        const currentHash = crypto.createHash('sha256').update(document.getText()).digest('hex');

        if (cachedState && cachedState.hash === currentHash) {
            return cachedState;
        }
        
        this.debouncedUpdate(document);
        
        return this.stateCache.get(uriString) || this.createInitialLoadingState(document);
    }
    
    private debounceTimers = new Map<string, NodeJS.Timeout>();
    private debouncedUpdate(document: vscode.TextDocument, delay = 500) {
        const uriString = document.uri.toString();
        if (this.debounceTimers.has(uriString)) {
            clearTimeout(this.debounceTimers.get(uriString)!);
        }
        const timer = setTimeout(() => {
            this.updateDocumentState(document);
        }, delay);
        this.debounceTimers.set(uriString, timer);
    }

    private createInitialLoadingState(document: vscode.TextDocument): DocumentState {
        const uriString = document.uri.toString();
        const text = document.getText();
        const hash = crypto.createHash('sha256').update(text).digest('hex');
        const paragraphs = this.parsingEngine.fullParse(document);
        const loadingState: DocumentState = { uri: uriString, hash, paragraphs };
        this.stateCache.set(uriString, loadingState);
        return loadingState;
    }

    private async updateDocumentState(document: vscode.TextDocument) {
        const uriString = document.uri.toString();
        console.log(`[Manager] Updating state for ${uriString}`);

        const text = document.getText();
        const hash = crypto.createHash('sha256').update(text).digest('hex');

        const paragraphs = this.parsingEngine.fullParse(document);
        if (paragraphs.length === 0) {
            this.stateCache.delete(uriString);
            vscode.commands.executeCommand('mytex.internal.refreshSymbols');
            return;
        }
        
        const summarizingState: DocumentState = { uri: uriString, hash, paragraphs: paragraphs.map(p => ({ ...p, state: 'summarizing' })) };
        this.stateCache.set(uriString, summarizingState);
        vscode.commands.executeCommand('mytex.internal.refreshSymbols');

        try {
            const summaries = await this.llmController.summarizeParagraphs(paragraphs, text);
            
            const currentState = this.stateCache.get(uriString);
            if (!currentState || currentState.hash !== hash) {
                console.log(`[Manager] Document changed during summarization. Discarding results for ${uriString}.`);
                return;
            }

            const finalState: DocumentState = {
                ...currentState,
                paragraphs: currentState.paragraphs.map(p => {
                    const summary = summaries.get(p.id);
                    return { ...p, summary: summary, state: summary ? 'success' : 'initial' };
                })
            };
            
            this.stateCache.set(uriString, finalState);
            vscode.commands.executeCommand('mytex.internal.refreshSymbols');
            console.log(`[Manager] Successfully updated state for ${uriString}`);

        } catch (error) {
            console.error(`[Manager] Failed to update state for ${uriString}:`, error);
            const currentState = this.stateCache.get(uriString);
            if (currentState && currentState.hash === hash) {
                const failedState: DocumentState = {
                    ...currentState,
                    paragraphs: currentState.paragraphs.map(p => ({ ...p, state: 'failed' }))
                };
                this.stateCache.set(uriString, failedState);
                vscode.commands.executeCommand('mytex.internal.refreshSymbols');
            }
        }
    }

    private setupEventListeners(): void {
        const onOpen = vscode.workspace.onDidOpenTextDocument(doc => {
            if (doc.languageId === 'mytex') { this.updateDocumentState(doc); }
        });

        const onChange = vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.languageId === 'mytex') { this.debouncedUpdate(event.document); }
        });
        
        const onClose = vscode.workspace.onDidCloseTextDocument(doc => {
            if (doc.languageId === 'mytex') {
                const uriString = doc.uri.toString();
                this.stateCache.delete(uriString);
                if(this.debounceTimers.has(uriString)) {
                    clearTimeout(this.debounceTimers.get(uriString)!);
                    this.debounceTimers.delete(uriString);
                }
            }
        });

        this.disposables.push(onOpen, onChange, onClose);
    }

    public dispose() {
        this.disposables.forEach(d => d.dispose());
        this.debounceTimers.forEach(timer => clearTimeout(timer));
    }
}