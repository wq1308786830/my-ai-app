import {
    APICallError,
    InvalidResponseDataError,
    LanguageModelV2,
    LanguageModelV2CallOptions,
    LanguageModelV2CallWarning,
    LanguageModelV2Content, LanguageModelV2Prompt, LanguageModelV2StreamPart
} from '@ai-sdk/provider';
import { postJsonToApi } from '@ai-sdk/provider-utils';

const prefixUrl = 'http://localhost:8888/v1';

export class CustomChatLanguageModel implements LanguageModelV2 {
    readonly specificationVersion = 'v2';
    readonly provider: string;
    readonly modelId: string;
    readonly config: string;

    constructor(
        modelId: string,
        settings?: any,
        config?: any,
    ) {
        this.provider = config?.provider;
        this.modelId = modelId;
        this.config = config;
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

        // Make API call
        const response = await postJsonToApi({
            url: `${prefixUrl}/chat/completions`,
            headers: {
                // ...this.config.headers()
            },
            body: args,
            failedResponseHandler(options: {
                url: string;
                requestBodyValues: unknown;
                response: Response
            }): PromiseLike<{ value: APICallError; rawValue?: unknown; responseHeaders?: Record<string, string> }> {
                return Promise.resolve({value: '' as any });
            },
            successfulResponseHandler(options: {
                url: string;
                requestBodyValues: unknown;
                response: Response
            }): PromiseLike<{ value: T; rawValue?: unknown; responseHeaders?: Record<string, string> }> {
                return Promise.resolve({value: ''});
            },
            abortSignal: options.abortSignal
        });

        // Convert provider response to AI SDK format
        const content: LanguageModelV2Content[] = [];

        // Extract text content
        if (response.choices[0].message.content) {
            content.push({
                type: 'text',
                text: response.choices[0].message.content,
            });
        }

        // Extract tool calls
        if (response.choices[0].message.tool_calls) {
            for (const toolCall of response.choices[0].message.tool_calls) {
                content.push({
                    type: 'tool-call',
                    // toolCallType: 'function',
                    toolCallId: toolCall.id,
                    toolName: toolCall.function.name,
                    input: JSON.stringify(toolCall.function.arguments),
                });
            }
        }

        return {
            content,
            finishReason: this.mapFinishReason(response.choices[0].finish_reason),
            usage: {
                inputTokens: response.usage?.prompt_tokens,
                outputTokens: response.usage?.completion_tokens,
                totalTokens: response.usage?.total_tokens,
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
                                    throw new Error(`Unsupported part type: ${part.type}`);
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
                    throw new Error(`Unsupported message role: ${message.role}`);
            }
        });
    }

    private createTransformer(warnings: LanguageModelV2CallWarning[]) {
        let isFirstChunk = true;

        // return new TransformStream<ParsedChunk, LanguageModelV2StreamPart>({
        return new TransformStream<any, LanguageModelV2StreamPart>({
            async transform(chunk, controller) {
                // Send warnings with first chunk
                if (isFirstChunk) {
                    controller.enqueue({ type: 'stream-start', warnings });
                    isFirstChunk = false;
                }

                // Handle different chunk types
                if (chunk.choices?.[0]?.delta?.content) {
                    // console.log('JSON.stringify(chunk) === ', JSON.stringify(chunk))
                    controller.enqueue({
                        id: chunk.id,
                        type: 'text-delta',
                        delta: chunk.choices[0].delta.content,
                    });
                }

                if (chunk.choices?.[0]?.delta?.tool_calls) {
                    for (const toolCall of chunk.choices[0].delta.tool_calls) {
                        controller.enqueue({
                            type: 'tool-call', // 按照AI SDK标准类型
                            toolCallId: toolCall.id,
                            toolName: toolCall.function.name,
                            input: JSON.stringify(toolCall.function.arguments),
                        });
                    }
                }

                // Handle finish reason
                if (chunk.choices?.[0]?.finish_reason) {
                    controller.enqueue({
                        id: chunk.id,
                        type: 'text-end', // 按照AI SDK标准类型
                        // finishReason: chunk.choices[0].finish_reason,
                        // usage: {
                        //     inputTokens: chunk.usage?.prompt_tokens,
                        //     outputTokens: chunk.usage?.completion_tokens,
                        //     totalTokens: chunk.usage?.total_tokens,
                        // },
                    });
                }
            },
        });
    }

    private handleError(error: unknown): never {
        if (error instanceof Response) {
            const status = error.status;

            if (status === 429) {
                console.error('TooManyRequestsError')
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

    private convertAssistantMessage(message: any) {
        console.log('convertAssistantMessage', message);
    }
    private convertToolMessage(message: any) {
        console.log('convertToolMessage', message);
    }
    private convertFileToUrl(data: any) {
        console.log('convertFileToUrl', data);
        return ''
    }
    private mapFinishReason(reason: any) {
        console.log('mapFinishReason', reason);
    }
    private createParser() {
        // OpenAI SSE流解析器
        return new TransformStream<string, any>({
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
                    }
                }
            }
        });
    }
    private prepareTools(tools: any, choices: any) {
        console.log('prepareTools', tools, choices);
    }
    private getRetryAfter(error: any) {
        console.log('getRetryAfter', error);
    }
}
