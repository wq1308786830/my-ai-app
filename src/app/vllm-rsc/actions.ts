'use server';

import { streamText } from 'ai';
import { createStreamableValue } from '@ai-sdk/rsc';
import {CustomChatLanguageModel} from "./custom-chat-language-model";

export interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export async function continueConversation(history: Message[]) {
    'use server';

    const stream = createStreamableValue();

    (async () => {
        const { textStream } = streamText({
            model: new CustomChatLanguageModel('qwen1.7b'),
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