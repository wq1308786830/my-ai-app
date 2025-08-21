import {createOllama} from "ollama-ai-provider-v2";
import {streamText, UIMessage, convertToModelMessages, tool, stepCountIs} from 'ai';
import { z } from 'zod';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;
const ollamaPrefixUrl = 'http://localhost:11434/api';
const ollamaChatApi = `${ollamaPrefixUrl}/chat`
const ollama = createOllama({
    // optional settings, e.g.
    baseURL: ollamaPrefixUrl,
});

export async function POST(req: Request) {
    const { messages }: { messages: UIMessage[] } = await req.json();

    const result = streamText({
        model: ollama('qwen3:8b'),
        messages: convertToModelMessages(messages),
        stopWhen: stepCountIs(5),

        tools: {
            weather: tool({
                description: 'Get the weather in a location (fahrenheit)',
                inputSchema: z.object({
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

    return result.toUIMessageStreamResponse();
}