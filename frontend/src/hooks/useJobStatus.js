import { useState, useEffect, useRef } from 'react'
import { getStatus } from '../api'

const TERMINAL_STATUSES = new Set(['done', 'error'])

function isDone(job) {
    if (!job) return false
    return (
        TERMINAL_STATUSES.has(job.extract_status) &&
        TERMINAL_STATUSES.has(job.rag_status)
    )
}

/**
 * useJobStatus — polls GET /status/{jobId} every 1.5s.
 * Stops automatically when both pipelines reach done/error.
 *
 * Returns: { job, loading, error }
 */
export default function useJobStatus(jobId) {
    const [job, setJob] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const intervalRef = useRef(null)

    useEffect(() => {
        if (!jobId) return

        setLoading(true)
        setError(null)

        const poll = async () => {
            try {
                const data = await getStatus(jobId)
                setJob(data)
                setLoading(false)
                if (isDone(data)) {
                    clearInterval(intervalRef.current)
                }
            } catch (err) {
                setError(err.message)
                setLoading(false)
                clearInterval(intervalRef.current)
            }
        }

        poll() // immediate first fetch
        intervalRef.current = setInterval(poll, 1500)

        return () => clearInterval(intervalRef.current)
    }, [jobId])

    return { job, loading, error }
}
