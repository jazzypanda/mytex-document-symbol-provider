import * as vscode from 'vscode';
import axios from 'axios';
import { getApiEndpoint, getModel, getPromptTemplate } from './Configuration';

const SECRET_KEY = 'mytex.llm.apiKey';

// NEW: Define an interface for the expected object in the JSON array.
interface LlmSummaryObject {
    count: number;
    summary: string;
}

export class LlmService {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    private async getApiKey(): Promise<string | undefined> {
        return await this.context.secrets.get(SECRET_KEY);
    }

    // The public signature remains the same (Promise<string[]>),
    // so no other files need to change.
    public async getParagraphSummaries(fulltext: string, paragraphs: string[]): Promise<string[]> {
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            vscode.window.showWarningMessage('MyTeX LLM API Key is not set. Please use the "MyTeX: Set LLM API Key" command.', 'Set Key').then(selection => {
                if (selection === 'Set Key') {
                    vscode.commands.executeCommand('mytex.setApiKey');
                }
            });
            throw new Error('API key not found.');
        }

        const numparagraphs = paragraphs.length;
        let prompt = getPromptTemplate();
        prompt = prompt.replace('{{fulltext}}', fulltext);
        prompt = prompt.replace(/{{numparagraphs}}/g, numparagraphs.toString()); // Use regex for global replace

        try {
            const response = await axios.post(
                getApiEndpoint(),
                {
                    model: getModel(),
                    messages: [{ role: 'user', content: prompt }],
                    response_format: { "type": "json_object" }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            let content = response.data.choices[0].message.content;
            
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                content = jsonMatch[1];
            }
            
            // UPDATED: Parse and validate the new structure.
            const summaries: LlmSummaryObject[] = JSON.parse(content);

            // --- Robust Validation Logic ---
            if (!Array.isArray(summaries) || summaries.length !== numparagraphs) {
                throw new Error(`LLM returned an invalid format. Expected array of length ${numparagraphs}, got ${summaries.length}.`);
            }

            for (let i = 0; i < summaries.length; i++) {
                const item = summaries[i];
                const expectedCount = i + 1;
                if (typeof item.count !== 'number' || typeof item.summary !== 'string' || item.count !== expectedCount) {
                    throw new Error(`LLM returned a malformed item at index ${i}. Expected count ${expectedCount}, but got ${JSON.stringify(item)}.`);
                }
            }
            
            // If validation passes, extract just the summary strings.
            return summaries.map(s => s.summary);

        } catch (error: any) {
            console.error('LLM API request failed:', error);
            vscode.window.showErrorMessage(`MyTeX LLM request failed: ${error.message}`);
            throw error;
        }
    }
}

// The setApiKey and clearApiKey functions remain unchanged.
export async function setApiKey(context: vscode.ExtensionContext) { /* ... no changes ... */ }
export async function clearApiKey(context: vscode.ExtensionContext) { /* ... no changes ... */ }