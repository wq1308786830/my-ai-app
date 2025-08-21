'use client';

import { useChat } from '@ai-sdk/react';
import { useState } from 'react';
import ReactMarkdown from "react-markdown";

export default function Chat() {
    const [input, setInput] = useState('');
    const { messages, sendMessage } = useChat();
    return (
        <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
            {messages.map(message => (
                <div key={message.id} className="whitespace-pre-wrap">
                    {message.role === 'user' ? 'User: ' : 'AI: '}
                    {message.parts.map((part, i) => {
                        switch (part.type) {
                            case 'text':
                                return <ReactMarkdown key={`${message.id}-${i}`}>{part.text}</ReactMarkdown>;
                            case 'tool-weather':
                                return (
                                    <pre key={`${message.id}-${i}`}>
                                        {JSON.stringify(part, null, 2)}
                                    </pre>
                                );
                        }
                    })}
                </div>
            ))}

            <form
                onSubmit={e => {
                    e.preventDefault();
                    sendMessage({ text: input });
                    setInput('');
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