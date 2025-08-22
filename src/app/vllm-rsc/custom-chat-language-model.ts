import {
    APICallError,
    LanguageModelV2,
    LanguageModelV2CallOptions,
    LanguageModelV2CallWarning,
    LanguageModelV2Content,
    LanguageModelV2DataContent, LanguageModelV2FinishReason,
    LanguageModelV2FunctionTool, LanguageModelV2Prompt, LanguageModelV2ProviderDefinedTool, LanguageModelV2StreamPart,
    LanguageModelV2ToolChoice
} from '@ai-sdk/provider';
import {postJsonToApi, ToolCall} from '@ai-sdk/provider-utils';

interface APIResponse {
    choices: {
        message: {
            role: string;
            content: string;
            tool_calls?:  ToolCall<string, string>[];
        };
        finish_reason: string;
    }[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

interface ParsedChunk {
    id: string;
    choices: {
        delta: {
            content?: string;
            tool_calls?:  ToolCall<string, string>[];
        };
        finish_reason?: string;
    }[];
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
}

interface AssistantMessage {
    role: string;
    content: string | { type: string; text?: string; data?: LanguageModelV2DataContent }[];
    tool_calls?: ToolCall<string, string>[];
}


const prefixUrl = 'http://localhost:8888/v1';

export interface CustomChatLanguageModelConfig {
    provider: string;
    apiKey?: string;
    headers?: () => Record<string, string>;
    // [key: string]: any;
}

export class CustomChatLanguageModel implements LanguageModelV2 {
    readonly specificationVersion = 'v2';
    readonly provider: string;
    readonly modelId: string;
    readonly config: CustomChatLanguageModelConfig;

    constructor(
        modelId: string,
        config?: CustomChatLanguageModelConfig
    ) {
        this.provider = config?.provider || '';
        this.modelId = modelId;
        this.config = config ?? { provider: '' };
        // Initialize with settings and config
    }

    // Convert AI SDK prompt to provider format
    private getArgs(options: LanguageModelV2CallOptions) {
        const warnings: LanguageModelV2CallWarning[] = [];

        // Map messages to provider format
        const messages = this.convertToProviderMessages(options.prompt);

        // Handle tools if provided
        const tools = options.tools
            ? this.prepareTools(options.tools, options.toolChoice)
            : undefined;

        // Build request body
        const body = {
            model: this.modelId,
            messages,
            temperature: options.temperature,
            max_tokens: options.maxOutputTokens,
            stop: options.stopSequences,
            tools,
            // ... other parameters
        };

        return { args: body, warnings };
    }

    async doGenerate(options: LanguageModelV2CallOptions) {
        const { args, warnings } = this.getArgs(options);

        // 发送请求
        const response = await postJsonToApi<APIResponse>({
            url: `${prefixUrl}/chat/completions`,
            headers: {
                // ...this.config.headers()
            },
            body: args,
            failedResponseHandler(options) {
                return options.response.json().then((responseBody) => {
                    const error = new APICallError({
                        message: responseBody.error?.message || 'Unknown error',
                        url: options.url,
                        requestBodyValues: options.requestBodyValues,
                        statusCode: options.response.status,
                        cause: options.response,
                        isRetryable: options.response.status >= 500 && options.response.status < 600,
                    });
                    const responseHeaders = Object.fromEntries(options.response.headers.entries());
                    return { value: error, rawValue: responseBody, responseHeaders };
                }).catch((parseError) => {
                    const error = new APICallError({
                        message: 'Failed to parse response body',
                        url: options.url,
                        requestBodyValues: options.requestBodyValues,
                        statusCode: options.response.status,
                        cause: parseError,
                        isRetryable: options.response.status >= 500 && options.response.status < 600,
                    });
                    const responseHeaders = Object.fromEntries(options.response.headers.entries());
                    return { value: error, rawValue: null, responseHeaders };
                });
            },
            successfulResponseHandler(options) {
                return options.response.json().then((responseBody) => {
                    const responseHeaders = Object.fromEntries(options.response.headers.entries());
                    return { value: responseBody as APIResponse, rawValue: responseBody, responseHeaders };
                }).catch(() => {
                    return { value: {} as APIResponse, rawValue: null, responseHeaders: {} };
                });
            },
            abortSignal: options.abortSignal
        });

        // 转换响应为AI SDK5内容格式
        const content: LanguageModelV2Content[] = [];
        const choice = response.value.choices[0];

        if (choice.message.content) {
            content.push({
                type: 'text',
                text: choice.message.content,
            });
        }

        if (choice.message.tool_calls) {
            for (const toolCall of choice.message.tool_calls) {
                content.push({
                    type: 'tool-call',
                    // @ts-expect-error inner type
                    toolCallId: toolCall.id,
                    // @ts-expect-error inner type
                    toolName: toolCall.function.name,
                    // @ts-expect-error inner type
                    input: JSON.stringify(toolCall.function.arguments),
                });
            }
        }

        const finishReason: LanguageModelV2FinishReason = this.mapFinishReason(choice.finish_reason);

        return {
            content,
            finishReason,
            usage: {
                inputTokens: response.value.usage?.prompt_tokens,
                outputTokens: response.value.usage?.completion_tokens,
                totalTokens: response.value.usage?.total_tokens,
            },
            request: { body: args },
            response: { body: response },
            warnings,
        };
    }


    async doStream(options: LanguageModelV2CallOptions) {
        console.log('doStream === ', JSON.stringify(options))
        const { args, warnings } = this.getArgs(options);

        // Create streaming response
        const response = await fetch(`${prefixUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                // ...this.config.headers(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ...args, stream: true }),
            signal: options.abortSignal,
        });

        // Transform stream to AI SDK format
        const stream = response
            .body!.pipeThrough(new TextDecoderStream())
            .pipeThrough(this.createParser())
            .pipeThrough(this.createTransformer(warnings));

        return { stream, warnings };
    }

    // Supported URL patterns for native file handling
    get supportedUrls() {
        return {
            'image/*': [/^https:\/\/example\.com\/images\/.*/],
        };
    }

    private convertToProviderMessages(prompt: LanguageModelV2Prompt) {
        return prompt.map((message) => {
            switch (message.role) {
                case 'system':
                    return { role: 'system', content: message.content };

                case 'user':
                    return {
                        role: 'user',
                        content: message.content.map((part) => {
                            switch (part.type) {
                                case 'text':
                                    return { type: 'text', text: part.text };
                                case 'file':
                                    return {
                                        type: 'image_url',
                                        image_url: {
                                            url: this.convertFileToUrl(part.data),
                                        },
                                    };
                                default:
                                    throw new Error(`Unsupported part type: ${part}`);
                            }
                        }),
                    };

                case 'assistant':
                    // Handle assistant messages with text, tool calls, etc.
                    return this.convertAssistantMessage(message);

                case 'tool':
                    // Handle tool results
                    return this.convertToolMessage(message);

                default:
                    throw new Error(`Unsupported message role: ${message}`);
            }
        });
    }

    private mapFinishReason(reason: string | null): LanguageModelV2FinishReason {
        switch (reason) {
            case 'stop':
                return 'stop';
            case 'length':
                return 'length';
            case 'content-filter':
                return 'content-filter';
            case 'null':
                return 'stop'; // 或者其他默认值
            default:
                throw new Error(`Unsupported finish reason: ${reason}`);
        }
    }

    private createTransformer(warnings: LanguageModelV2CallWarning[]) {
        let isFirstChunk = true;
        const mapFinishReason = this.mapFinishReason; // 保存引用

        return new TransformStream<ParsedChunk, LanguageModelV2StreamPart>({
            async transform(chunk, controller) {
                // Send warnings with first chunk
                if (isFirstChunk) {
                    controller.enqueue({ type: 'stream-start', warnings });
                    isFirstChunk = false;
                }

                // Handle different chunk types
                if (chunk.choices?.[0]?.delta?.content) {
                    controller.enqueue({
                        id: chunk.id,
                        type: 'text-delta',
                        delta: chunk.choices[0].delta.content,
                    });
                }

                if (chunk.choices?.[0]?.delta?.tool_calls) {
                    for (const toolCall of chunk.choices[0].delta.tool_calls) {
                        controller.enqueue({
                            type: 'tool-call',
                            // @ts-expect-error inner type
                            toolCallId: toolCall.id,
                            // @ts-expect-error inner type
                            toolName: toolCall.function.name,
                            // @ts-expect-error inner type
                            input: JSON.stringify(toolCall.function.arguments),
                        });
                    }
                }

                // Handle finish reason
                if (chunk.choices?.[0]?.finish_reason) {
                    controller.enqueue({
                        id: chunk.id,
                        type: 'text-end',
                        // @ts-expect-error inner type
                        finishReason: mapFinishReason(chunk.choices[0].finish_reason),
                        usage: {
                            inputTokens: chunk.usage?.prompt_tokens,
                            outputTokens: chunk.usage?.completion_tokens,
                            totalTokens: chunk.usage?.total_tokens,
                        },
                    });
                }
            },
        });
    }


    private handleError(error: unknown): never {
        if (error instanceof Response) {
            const status = error.status;

            if (status === 429) {
                console.error('TooManyRequestsError');
                // throw new TooManyRequestsError({
                //     cause: error,
                //     retryAfter: this.getRetryAfter(error),
                // });
            }

            throw new APICallError({
                message: error.statusText,
                url: error.url,
                requestBodyValues: error.body,
                statusCode: status,
                // statusText: error.statusText,
                cause: error,
                isRetryable: status >= 500 && status < 600,
            });
        }

        throw error;
    }

    private convertAssistantMessage(message: AssistantMessage) {
        console.log('convertAssistantMessage', message);
    }
    private convertToolMessage(message: AssistantMessage) {
        console.log('convertToolMessage', message);
    }
    private convertFileToUrl(data: LanguageModelV2DataContent) {
        console.log('convertFileToUrl', data);
        return ''
    }

    private createParser() {
        // OpenAI SSE流解析器
        return new TransformStream<string, ParsedChunk>({
            transform(chunk, controller) {
                // 按行分割
                const lines = chunk.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data:')) continue;
                    const data = trimmed.slice(5).trim();
                    if (data === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(data);
                        controller.enqueue(parsed);
                    } catch (e) {
                        // 忽略解析错误
                        console.log(e)
                    }
                }
            }
        });
    }
    private prepareTools(tools: Array<LanguageModelV2FunctionTool | LanguageModelV2ProviderDefinedTool>, choices: LanguageModelV2ToolChoice | undefined) {
        console.log('prepareTools', tools, choices);
    }
}
