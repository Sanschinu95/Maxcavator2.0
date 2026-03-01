/**
 * useChat — manages chat history and SSE streaming for the ChatPage.
 */
import { useState, useRef, useCallback } from 'react'
import { chatStream } from '../api'

export default function useChat(docId) {
    const [messages, setMessages] = useState([])
    const [sources, setSources] = useState([])
    const [streaming, setStreaming] = useState(false)
    const [error, setError] = useState(null)
    const abortRef = useRef(null)

    const send = useCallback((query) => {
        if (!query.trim() || streaming) return

        // Add user message immediately
        const userMsg = { role: 'user', content: query }
        setMessages(prev => [...prev, userMsg])
        setSources([])
        setError(null)
        setStreaming(true)

        // Placeholder for assistant response being built
        let assistantText = ''
        setMessages(prev => [...prev, { role: 'assistant', content: '' }])

        abortRef.current = chatStream({
            query,
            docId: docId || null,
            history: messages,
            onToken: (token) => {
                assistantText += token
                setMessages(prev => {
                    const updated = [...prev]
                    updated[updated.length - 1] = { role: 'assistant', content: assistantText }
                    return updated
                })
            },
            onSources: (chunks) => {
                setSources(chunks)
            },
            onDone: () => {
                setStreaming(false)
            },
            onError: (msg) => {
                setError(msg)
                setStreaming(false)
                // Remove empty assistant placeholder on error
                setMessages(prev => {
                    const updated = [...prev]
                    if (updated.length > 0 && updated[updated.length - 1].role === 'assistant' && !updated[updated.length - 1].content) {
                        return updated.slice(0, -1)
                    }
                    return updated
                })
            },
        })
    }, [messages, docId, streaming])

    const abort = useCallback(() => {
        abortRef.current?.abort()
        setStreaming(false)
    }, [])

    const clear = useCallback(() => {
        abort()
        setMessages([])
        setSources([])
        setError(null)
    }, [abort])

    return { messages, sources, streaming, error, send, abort, clear }
}
