import { useEffect, useRef, useState } from 'react'
import { examHeartbeat, resumeExam } from '@/api/examApi'

interface CountdownOptions {
  sessionCode: string | null
  questionId?: string
  questionIndex?: number
  remainingSeconds?: number
  active: boolean
  submitting: boolean
  onExpire: () => void
}

/** Display only server-confirmed time. Failed/offline probes never trigger a timeout. */
export function useConnectedCountdown({
  sessionCode, questionId, questionIndex, remainingSeconds, active, submitting, onExpire,
}: CountdownOptions) {
  const [state, setState] = useState({ questionId, remainingSeconds, paused: false })
  const latest = useRef({ submitting, onExpire })
  useEffect(() => { latest.current = { submitting, onExpire } })

  useEffect(() => {
    if (!active || !sessionCode || !questionId || !questionIndex) return
    let cancelled = false
    let pending = false
    let expired = false
    let needsResume = true
    let controller: AbortController | undefined
    const pause = () => {
      needsResume = true
      controller?.abort()
      setState((previous) => ({ questionId, remainingSeconds: previous.questionId === questionId ? previous.remainingSeconds : undefined, paused: true }))
    }
    const probe = async () => {
      if (cancelled || pending || expired || latest.current.submitting) return
      if (!navigator.onLine) { pause(); return }
      pending = true
      controller = new AbortController()
      const timeout = window.setTimeout(() => controller?.abort(), 2500)
      try {
        const response = needsResume
          ? await resumeExam(sessionCode, controller.signal)
          : await examHeartbeat(sessionCode, questionId, questionIndex, controller.signal)
        if (cancelled) return
        const q = response.data?.currentQuestion
        if (response.code !== 200 || !q || q.questionId !== questionId || typeof q.remainingSeconds !== 'number') {
          throw new Error('无法同步当前题目')
        }
        const seconds = Math.max(0, Math.ceil(q.remainingSeconds))
        needsResume = false
        setState({ questionId, remainingSeconds: seconds, paused: false })
        if (seconds === 0 && !latest.current.submitting) {
          expired = true
          latest.current.onExpire()
        }
      } catch {
        if (!cancelled) pause()
      } finally {
        window.clearTimeout(timeout)
        pending = false
      }
    }
    // No probes on the welcome screen: candidates never lose a whole question
    // while they cannot see the exam after reloading or closing the page.
    void probe()
    const interval = window.setInterval(() => void probe(), 1000)
    window.addEventListener('offline', pause)
    window.addEventListener('online', probe)
    return () => {
      cancelled = true
      controller?.abort()
      window.clearInterval(interval)
      window.removeEventListener('offline', pause)
      window.removeEventListener('online', probe)
    }
  }, [active, sessionCode, questionId, questionIndex])

  // Show the new question's budget until its first probe returns.
  return state.questionId === questionId
    ? { remainingSeconds: state.remainingSeconds ?? remainingSeconds, paused: state.paused }
    : { remainingSeconds, paused: false }
}
