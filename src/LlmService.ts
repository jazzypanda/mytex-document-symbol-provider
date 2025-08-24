import * as vscode from 'vscode';
import axios from 'axios';
import { getApiEndpoint, getModel, getPromptTemplate } from './Configuration';

const SECRET_KEY = 'mytex.llm.apiKey';

export class LlmService {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    private async getApiKey(): Promise<string | undefined> {
        return await this.context.secrets.get(SECRET_KEY);
    }

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
        prompt = prompt.replace('{{numparagraphs}}', numparagraphs.toString());

        try {
            const response = await axios.post(
                getApiEndpoint(),
                {
                    model: getModel(),
                    messages: [{ role: 'user', content: prompt }],
                    // OpenAI API 支持 response_format 来强制 JSON 输出
                    // 对于其他模型，可以设置 logit_bias 或 grammars，这里我们用更通用的方式
                    // 通过 prompt engineering 和设置起始词（如果API支持）来规范输出
                    // 例如，可以在 prompt 中要求它以 `[` 开头，或者使用 `logit_bias`
                    response_format: { "type": "json_object" } // 对支持的模型很有用
                },
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // 尝试解析返回的内容
            let content = response.data.choices[0].message.content;
            
            // 健壮性处理：LLM 可能返回被 markdown 包裹的 JSON
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                content = jsonMatch[1];
            }
            
            const summaries = JSON.parse(content);

            // 校验返回结果
            if (!Array.isArray(summaries) || summaries.length !== numparagraphs) {
                throw new Error(`LLM returned an invalid format. Expected array of length ${numparagraphs}, got ${summaries.length}.`);
            }
            
            return summaries.map(s => String(s)); // 确保是字符串

        } catch (error: any) {
            console.error('LLM API request failed:', error);
            vscode.window.showErrorMessage(`MyTeX LLM request failed: ${error.message}`);
            // 抛出异常，让调用方处理降级逻辑
            throw error;
        }
    }
}

// 静态函数用于管理 API 密钥，可以在 extension.ts 中调用
export async function setApiKey(context: vscode.ExtensionContext) {
    const apiKey = await vscode.window.showInputBox({
        prompt: 'Enter your OpenAI-compatible API Key',
        password: true,
        ignoreFocusOut: true,
    });
    if (apiKey) {
        await context.secrets.store(SECRET_KEY, apiKey);
        vscode.window.showInformationMessage('MyTeX API Key stored successfully.');
    }
}

export async function clearApiKey(context: vscode.ExtensionContext) {
    await context.secrets.delete(SECRET_KEY);
    vscode.window.showInformationMessage('MyTeX API Key cleared.');
}