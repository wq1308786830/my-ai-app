'use server';

import { streamText } from 'ai';
import { createStreamableValue } from '@ai-sdk/rsc';
import {CustomChatLanguageModel} from "@/app/custom-chat-language-model";
import {LanguageModelV2} from "@ai-sdk/provider";

export interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export async function continueConversation(history: Message[]) {
    'use server';

    const stream = createStreamableValue();

    (async () => {
        const { textStream } = streamText({
            model: new CustomChatLanguageModel('qwen1.7b') as any,
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