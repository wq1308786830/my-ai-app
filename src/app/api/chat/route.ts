import { streamText, tool } from 'ai';
import { z } from 'zod';

export const maxDuration = 30;

export async function POST(req: Request) {
    const { messages } = await req.json();

    const result = streamText({
        model: qwen17BModel,
        messages,
        tools: {
            weather: tool({
                description: 'Get the weather in a location (fahrenheit)',
                parameters: z.object({
                    location: z.string().describe('The location to get the weather for'),
                }),
                execute: async ({ location }) => {
                    const temperature = Math.round(Math.random() * (90 - 32) + 32);
                    return {
                        location,
                        temperature,
                    };
                },
            }),
        },
    });

    return result.toDataStreamResponse();
}

import { ReadableStream } from 'node:stream/web';

const qwen17BModel = {
    specificationVersion: 'v1',
    provider: 'Qwen',
    modelId: 'qwen3-1.7b',
    defaultObjectGenerationMode: 'json',
    supportsStructuredOutputs: true, // 支持JSON Schema约束

    // 实现流式生成方法
    doStream: async (options: any) => {
        const { input, tools, settings } = options;
        const apiUrl = 'http://localhost:8888/v1/chat/completions';

        // 构建API请求体 [5,7](@ref)
        const body = {
            model: 'qwen3-1.7b',
            messages: input.messages,
            tools: tools?.map((tool: any) => ({
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters
                }
            })),
            stream: true,
            temperature: settings?.temperature ?? 0.7,
            max_tokens: settings?.maxTokens ?? 512
        };

        // 发起流式请求 [1,5](@ref)
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.QWEN_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        // 创建可读流 [1](@ref)
        const stream = new ReadableStream({
            async start(controller) {
                const reader = response.body!.getReader();
                const decoder = new TextDecoder('utf-8');
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n\n');

                    for (const line of lines) {
                        if (line.startsWith('data:')) {
                            const jsonStr = line.replace('data:', '').trim();
                            try {
                                const event = JSON.parse(jsonStr);
                                const textChunk = event.choices[0]?.delta?.content || '';

                                // 转换为标准输出格式 [5](@ref)
                                controller.enqueue({
                                    type: 'text-delta',
                                    textDelta: textChunk
                                });
                            } catch (e) {
                                controller.enqueue({
                                    type: 'error',
                                    error: `JSON解析错误: ${e.message}`
                                });
                            }
                        }
                    }
                }
                controller.close();
            }
        });

        return {
            stream,
            rawCall: {
                rawPrompt: input.messages,
                rawSettings: settings
            },
            warnings: []
        };
    },

    // 非流式生成方法（简略实现）
    doGenerate: async (options) => {
        /* 同步请求实现逻辑 */
    }
};