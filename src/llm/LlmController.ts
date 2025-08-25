import * as vscode from 'vscode';
import axios from 'axios';
import { Paragraph } from '../core/types';
import { getApiEndpoint, getModel, getPromptTemplate, LlmSummaryObject } from '../utils/Configuration';

const SECRET_KEY = 'mytex.llm.apiKey';

export class LlmController {

    constructor(private context: vscode.ExtensionContext) {
        console.log('[LLM Controller] Initialized.');
    }
    
    private async getApiKey(): Promise<string | undefined> {
        return await this.context.secrets.get(SECRET_KEY);
    }

    /**
     * 接受段落数组和全文，为需要总结的段落触发LLM工作流
     * @param paragraphs 需要处理的段落
     * @param fullText 文档全文，用于构建prompt
     * @returns 返回一个Promise，解析为 Map<paragraphId, summary>
     */
    public async summarizeParagraphs(paragraphs: Paragraph[], fullText: string): Promise<Map<string, string>> {
        console.log(`[LLM Controller] Received ${paragraphs.length} paragraphs to summarize.`);
        
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            vscode.window.showWarningMessage('MyTeX LLM API Key is not set. Please use the "MyTeX: Set LLM API Key" command.', 'Set Key').then(selection => {
                if (selection === 'Set Key') {
                    vscode.commands.executeCommand('mytex.setApiKey');
                }
            });
            throw new Error('API key not found.');
        }

        const numParagraphs = paragraphs.length;
        if (numParagraphs === 0) {
            return new Map();
        }

        let prompt = getPromptTemplate();
        prompt = prompt.replace('{{fulltext}}', fullText);
        prompt = prompt.replace(/{{numparagraphs}}/g, numParagraphs.toString());

        try {
            const response = await axios.post(
                getApiEndpoint(),
                {
                    model: getModel(),
                    messages: [{ role: 'user', content: prompt }],
                    response_format: { "type": "json_object" } // Request JSON output
                },
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            let content = response.data.choices[0].message.content;
            
            // Extract content from markdown code block if present
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                content = jsonMatch[1];
            }
            
            // Parse and validate the structure
            const summaries: LlmSummaryObject[] = JSON.parse(content);
            this.validateLlmResponse(summaries, numParagraphs);

            // If validation passes, map summaries to paragraph IDs
            const summaryResults = new Map<string, string>();
            for (let i = 0; i < summaries.length; i++) {
                if (paragraphs[i]) {
                    const paragraphId = paragraphs[i].id;
                    const summaryText = summaries[i].summary;
                    summaryResults.set(paragraphId, summaryText);
                }
            }
            
            console.log('[LLM Controller] Summarization finished successfully.');
            return summaryResults;

        } catch (error: any) {
            console.error('LLM API request failed:', error);
            const errorMessage = error.response?.data?.error?.message || error.message;
            vscode.window.showErrorMessage(`MyTeX LLM request failed: ${errorMessage}`);
            throw error; // Re-throw to be caught by DocumentManager
        }
    }

    /**
     * Validates the structure of the LLM JSON response.
     * Throws an error if validation fails.
     */
    private validateLlmResponse(summaries: any, expectedLength: number): void {
        if (!Array.isArray(summaries) || summaries.length !== expectedLength) {
            throw new Error(`LLM returned an invalid format. Expected array of length ${expectedLength}, got ${summaries.length}.`);
        }

        for (let i = 0; i < summaries.length; i++) {
            const item = summaries[i];
            const expectedCount = i + 1;
            if (typeof item.count !== 'number' || typeof item.summary !== 'string' || item.count !== expectedCount) {
                throw new Error(`LLM returned a malformed item at index ${i}. Expected count ${expectedCount}, but got ${JSON.stringify(item)}.`);
            }
        }
    }
}