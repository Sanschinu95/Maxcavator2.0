import { useState, useRef, useCallback } from 'react'
import { chatStream } from '../api'

let _msgId = 0
const nextId = () => `msg-${++_msgId}`

/**
 * useChat — manages chat history and SSE streaming.
 *
 * Returns:
 *   messages      — array of { id, role, content, streaming }
 *   sources       — latest source chunks
 *   isStreaming   — bool
 *   sendMessage   — fn(text, docId)
 *   clearHistory  — fn()
 */
export default function useChat() {
    const [messages, setMessages] = useState([])
    const [sources, setSources] = useState([])
    const [isStreaming, setIsStreaming] = useState(false)
    const abortRef = useRef(null)

    const sendMessage = useCallback((text, docId) => {
        if (!text.trim() || isStreaming) return

        // Append user message
        const userMsg = { id: nextId(), role: 'user', content: text }
        setMessages(prev => [...prev, userMsg])
        setSources([])

        // Placeholder for streaming assistant message
        const assistantId = nextId()
        const assistantMsg = { id: assistantId, role: 'assistant', content: '', streaming: true }
        setMessages(prev => [...prev, assistantMsg])
        setIsStreaming(true)

        // Build history (exclude the in-progress assistant placeholder)
        const history = messages.concat(userMsg).map(m => ({
            role: m.role,
            content: m.content,
        }))

        abortRef.current = chatStream({
            query: text,
            docId: docId || null,
            history,
            onToken: (token) => {
                setMessages(prev =>
                    prev.map(m =>
                        m.id === assistantId
                            ? { ...m, content: m.content + token }
                            : m
                    )
                )
            },
            onSources: (chunks) => {
                setSources(chunks)
            },
            onDone: () => {
                setMessages(prev =>
                    prev.map(m =>
                        m.id === assistantId ? { ...m, streaming: false } : m
                    )
                )
                setIsStreaming(false)
            },
            onError: (errMsg) => {
                setMessages(prev =>
                    prev.map(m =>
                        m.id === assistantId
                            ? { ...m, content: `⚠ ${errMsg}`, streaming: false }
                            : m
                    )
                )
                setIsStreaming(false)
            },
        })
    }, [messages, isStreaming])

    const clearHistory = useCallback(() => {
        abortRef.current?.abort()
        setMessages([])
        setSources([])
        setIsStreaming(false)
    }, [])

    return { messages, sources, isStreaming, sendMessage, clearHistory }
}
