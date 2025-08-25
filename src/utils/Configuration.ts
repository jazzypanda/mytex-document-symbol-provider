import * as vscode from 'vscode';

// NEW: Define an interface for the expected object in the JSON array from the LLM.
export interface LlmSummaryObject {
    count: number;
    summary: string;
}

function getConfig() {
    return vscode.workspace.getConfiguration('mytex.llm');
}

export function getApiEndpoint(): string {
    return getConfig().get('apiEndpoint') || 'https://api.openai.com/v1/chat/completions';
}

export function getModel(): string {
    return getConfig().get('model') || 'gpt-3.5-turbo';
}

export function getPromptTemplate(): string {
    // This prompt is specifically crafted to request a JSON object with count and summary.
    const defaultPrompt = `You are a highly skilled assistant specialized in summarizing academic texts. I will provide you with the full text of an introduction section and the number of paragraphs it contains. Your task is to return a valid JSON array where each element is an object with two keys: "count" (the paragraph number, starting from 1) and "summary" (a concise summary under 15 words). Do not include any explanations or introductory text outside of the JSON array.

The full text has {{numparagraphs}} paragraphs.

Full Text:
"""
{{fulltext}}
"""`;
    return getConfig().get('prompt') || defaultPrompt;
}

// NEW: Functions to manage the API Key, previously in LlmService.
export async function setApiKey(context: vscode.ExtensionContext) {
    const apiKey = await vscode.window.showInputBox({
        prompt: 'Enter your MyTeX LLM API Key',
        password: true,
        ignoreFocusOut: true,
    });
    if (apiKey) {
        await context.secrets.store('mytex.llm.apiKey', apiKey);
        vscode.window.showInformationMessage('MyTeX LLM API Key has been set.');
    }
}

export async function clearApiKey(context: vscode.ExtensionContext) {
    await context.secrets.delete('mytex.llm.apiKey');
    vscode.window.showInformationMessage('MyTeX LLM API Key has been cleared.');
}