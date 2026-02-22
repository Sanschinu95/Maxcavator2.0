import { useEffect, useRef } from 'react'

/**
 * ChatWindow — renders the message list and the input box.
 *
 * Props:
 *   messages    — array of { id, role, content, streaming }
 *   onSend      — fn(text: string)
 *   isStreaming — bool
 */
export default function ChatWindow({ messages, onSend, isStreaming }) {
    const bottomRef = useRef(null)
    const textareaRef = useRef(null)

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
        }
    }

    const submit = () => {
        const text = textareaRef.current?.value?.trim()
        if (!text || isStreaming) return
        textareaRef.current.value = ''
        textareaRef.current.style.height = 'auto'
        onSend(text)
    }

    const handleInput = () => {
        const ta = textareaRef.current
        if (!ta) return
        ta.style.height = 'auto'
        ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'
    }

    return (
        <div className="chat-window">
            {/* Messages */}
            <div className="chat-messages" role="log" aria-live="polite" aria-label="Chat messages">
                {messages.length === 0 ? (
                    <div className="chat-empty">
                        <span className="chat-empty-icon">◈</span>
                        <span className="chat-empty-text">
                            Ask anything about the document.
                        </span>
                        <span className="text-xs text-muted">
                            Shift+Enter for new line · Enter to send
                        </span>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`chat-message ${msg.role}${msg.streaming ? ' streaming' : ''}`}
                            id={`msg-${msg.id}`}
                        >
                            <div className="chat-role-label">
                                {msg.role === 'user' ? 'You' : 'Maxcavator'}
                            </div>
                            <div className="chat-bubble">
                                {msg.content || (msg.streaming ? '' : '…')}
                            </div>
                        </div>
                    ))
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="chat-input-area">
                <textarea
                    ref={textareaRef}
                    id="chat-input"
                    placeholder="Ask a question about the document…"
                    onKeyDown={handleKeyDown}
                    onInput={handleInput}
                    disabled={isStreaming}
                    rows={1}
                    aria-label="Chat input"
                />
                <button
                    className="btn btn-teal"
                    onClick={submit}
                    disabled={isStreaming}
                    id="chat-send-btn"
                    aria-label="Send message"
                    style={{ flexShrink: 0, height: 44 }}
                >
                    {isStreaming ? <span className="spinner" style={{ width: 16, height: 16 }} /> : '→ Send'}
                </button>
            </div>
        </div>
    )
}
