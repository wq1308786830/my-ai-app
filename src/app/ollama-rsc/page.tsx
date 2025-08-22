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
        <div>
            <div>
                {conversation.map((message, index) => (
                    <div key={index}>
                        {message.role}: <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                ))}
            </div>

            <div>
                <input
                    type="text"
                    value={input}
                    onChange={event => {
                        setInput(event.target.value);
                    }}
                />
                <button
                    onClick={async () => {
                        const { messages, newMessage } = await continueConversation([
                            ...conversation,
                            { role: 'user', content: input },
                        ]);

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
                    Send Message
                </button>
            </div>
        </div>
    );
}