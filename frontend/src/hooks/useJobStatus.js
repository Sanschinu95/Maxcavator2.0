/**
 * useJobStatus — polls GET /status/{jobId} every 1.5s until both pipelines finish.
 */
import { useState, useEffect, useRef } from 'react'
import { getStatus } from '../api'

export default function useJobStatus(jobId) {
    const [job, setJob] = useState(null)
    const [error, setError] = useState(null)
    const intervalRef = useRef(null)

    useEffect(() => {
        if (!jobId) {
            setJob(null)
            return
        }

        const poll = async () => {
            try {
                const data = await getStatus(jobId)
                setJob(data)

                const extractDone = data.extract_status === 'done' || data.extract_status === 'error'
                const ragDone = data.rag_status === 'done' || data.rag_status === 'error'

                if (extractDone && ragDone) {
                    clearInterval(intervalRef.current)
                }
            } catch (err) {
                setError(err.message)
                clearInterval(intervalRef.current)
            }
        }

        poll()
        intervalRef.current = setInterval(poll, 1500)

        return () => clearInterval(intervalRef.current)
    }, [jobId])

    return { job, error }
}
