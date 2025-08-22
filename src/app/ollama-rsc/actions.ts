'use server';

import { streamText } from 'ai';
import { createStreamableValue } from '@ai-sdk/rsc';
import {createOllama} from 'ollama-ai-provider-v2';

const ollamaPrefixUrl = 'http://localhost:11434/api';
const ollama = createOllama({
    // optional settings, e.g.
    baseURL: ollamaPrefixUrl,
});

export interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export async function continueConversation(history: Message[]) {
    'use server';

    const stream = createStreamableValue();

    (async () => {
        const { textStream } = streamText({
            model: ollama('qwen3:8b'),
            system: "你是一个中医大牛",
            messages: history,
        });

        for await (const text of textStream) {
            stream.update(text);
        }

        stream.done();
    })();

    return {
        messages: history,
        newMessage: stream.value,
    };
}