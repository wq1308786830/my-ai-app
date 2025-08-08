import {convertToModelMessages, streamText, tool, UIMessage  } from 'ai';
import { z } from 'zod';

export const maxDuration = 30;

export async function POST(req: Request) {
    const { messages }: { messages: UIMessage[] } = await req.json();

    try {
        const result = streamText({
            model: qwen17BModel,
            messages: convertToModelMessages(messages),
            tools: {

            },
        });

        return result.toUIMessageStreamResponse();
    } catch (error) {
        console.log('Error in POST:', error);
    }

}

import { ReadableStream } from 'node:stream/web';

const myProvider = createCustomProvider({
    baseURL: 'http://localhost:8888/v1',
    headers: { 'Authorization': `Bearer YOUR_API_KEY` }
});

const qwen17BModel = {
    specificationVersion: 'v2',
    provider: 'Qwen',
    modelId: 'qwen3-1.7b',
    supportsStructuredOutputs: false, // 支持JSON Schema约束
    supportedUrls: ['http://localhost:8888/v1/chat/completions'], // 新增
    // 实现流式生成方法
    doStream: async (options: any) => {
        const { prompt, tools, settings } = options;
        console.log('doStream messages', JSON.stringify(options));
        const apiUrl = 'http://localhost:8888/v1/chat/completions';

        // 构建API请求体 [5,7](@ref)
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({...options, messages: options.prompt})
        });
        console.log(222, JSON.stringify(response))

        // 创建可读流 [1](@ref)
        const stream = new ReadableStream({
            async start(controller) {
                const reader = response.body!.getReader();
                const decoder = new TextDecoder('utf-8');
                while (true) {
                    const {done, value} = await reader.read();
                    if (done) break;
                    console.log(decoder.decode(value))
                    controller.enqueue(decoder.decode(value));
                }
                controller.close();
            }
        });

        return { stream, rawCall: options, warnings: [] };
    },

    // 非流式生成方法（简略实现）
    doGenerate: async () => {
        /* 同步请求实现逻辑 */
    }
};