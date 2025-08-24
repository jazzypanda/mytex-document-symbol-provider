import * as vscode from 'vscode';

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
    const defaultPrompt = `You are a highly skilled assistant specialized in summarizing academic texts. I will provide you with the full text of an introduction section and the number of paragraphs it contains. Your task is to return a JSON array where each element is a concise summary (under 15 words) for the corresponding paragraph. Do not include any explanations or introductory text outside of the JSON array. The full text has {{numparagraphs}} paragraphs.\n\nFull Text:\n\"\"\"\n{{fulltext}}\n\"\"\"`;
    return getConfig().get('prompt') || defaultPrompt;
}