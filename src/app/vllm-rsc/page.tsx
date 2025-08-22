'use client';

import { useState } from 'react';
import { Message, continueConversation } from './actions';
import { readStreamableValue } from '@ai-sdk/rsc';
import ReactMarkdown from 'react-markdown'

export const maxDuration = 30;

export default function Home() {
    const [conversation, setConversation] = useState<Message[]>([]);
    const [input, setInput] = useState<string>('');

    return (
        <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
            {conversation.map((message, index) => (
                <div key={index}>
                    {message.role}: <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
            ))}

            <form
                onSubmit={async e => {
                    e.preventDefault();
                    const { messages, newMessage } = await continueConversation([
                        ...conversation,
                        { role: 'user', content: input },
                    ]);
                    setInput('');

                    let textContent = '';

                    for await (const delta of readStreamableValue(newMessage)) {
                        textContent = `${textContent}${delta}`;

                        setConversation([
                            ...messages,
                            { role: 'assistant', content: textContent },
                        ]);
                    }
                }}
            >
                <input
                    className="fixed bg-white dark:bg-zinc-900 bottom-0 w-full max-w-md p-2 mb-8 border border-zinc-300 dark:border-zinc-800 rounded shadow-xl"
                    value={input}
                    placeholder="Say something..."
                    onChange={e => setInput(e.currentTarget.value)}
                />
            </form>
        </div>
    );
}