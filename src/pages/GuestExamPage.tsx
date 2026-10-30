import { useState, useCallback, useEffect, useRef } from 'react'
import { Alert, Spin, message, Button, Popconfirm } from 'antd'
import GuestWelcomeScreen from '@/components/guest/GuestWelcomeScreen'
import GuestTestScreen from '@/components/guest/GuestTestScreen'
import GuestCompletionScreen from '@/components/guest/GuestCompletionScreen'
import {
  getAvailableExams,
  startExam,
  submitAnswer,
  finishExam,
  getExamProgress,
  getMyExamRecords,
  resumeExam,
  type CurrentQuestionResult,
} from '@/api/examApi'
import { combineQuestionDisplayHtml } from '@/utils/examHtml'
import { isGuestQuotaLimitMessage } from '@/utils/guestQuota'
import { useQuestionCountdown } from '@/hooks/useQuestionCountdown'

function normalizeQuestion(
  raw: Record<string, unknown> | null | undefined
): CurrentQuestionResult | null {
  if (!raw) return null
  const opts = raw.options
  const optionKeys = Array.isArray(opts)
    ? (opts as { key?: string }[]).map((o) => o?.key).filter(Boolean) as string[]
    : (raw.optionKeys as string[] | undefined) ?? []
  const optionsRecord: Record<string, string> = {}
  if (Array.isArray(opts)) {
    ;(opts as { key?: string; content?: string }[]).forEach((o) => {
      if (o?.key != null) optionsRecord[o.key] = o?.content ?? ''
    })
  } else if (
    raw.options &&
    typeof raw.options === 'object' &&
    !Array.isArray(raw.options)
  ) {
    Object.assign(optionsRecord, raw.options as Record<string, string>)
  }
  return {
    questionId: String(raw.questionId ?? ''),
    content: combineQuestionDisplayHtml(raw),
    questionType: (raw.questionType as number) ?? 0,
    difficulty: (raw.difficulty as number) ?? 0,
    optionKeys,
    options:
      Object.keys(optionsRecord).length > 0
        ? optionsRecord
        : (raw.options as Record<string, string>) ?? {},
    questionIndex: raw.questionIndex as number | undefined,
    totalQuestions: raw.totalQuestions as number | undefined,
    timeLimitSeconds: raw.timeLimitSeconds as number | undefined,
    remainingSeconds: raw.remainingSeconds as number | undefined,
    unansweredWarningSeconds: raw.unansweredWarningSeconds as number | undefined,
  }
}

type Phase = 'welcome' | 'testing' | 'done'

interface GuestExamPageProps {
  recruitmentYear: number
  recruitmentSeason: string
}

export default function GuestExamPage({ recruitmentYear, recruitmentSeason }: GuestExamPageProps) {
  const [phase, setPhase] = useState<Phase>('welcome')
  const [sessionCode, setSessionCode] = useState<string | null>(null)
  const [question, setQuestion] = useState<CurrentQuestionResult | null>(null)
  const [totalQuestions, setTotalQuestions] = useState<number>()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const submissionLockRef = useRef(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [availableExamId, setAvailableExamId] = useState<string | null>(null)
  const latestAnswerRef = useRef<string>('') // 记录当前题目已选择的答案
  const [existingSessionCode, setExistingSessionCode] = useState<string | null>(null)
  const [entryLoading, setEntryLoading] = useState(true)

  useEffect(() => {
    if (phase !== 'welcome') return

    let cancelled = false

    Promise.all([
      getAvailableExams({ pageNum: 1, pageSize: 50 }),
      getMyExamRecords({ pageNum: 1, pageSize: 10 }),
    ])
      .then(([examRes, recordRes]) => {
        if (cancelled) return

        if (examRes.code === 200 && examRes.data?.list?.length) {
          const first = examRes.data.list[0]
          setAvailableExamId(first.examId ?? first.id ?? null)
        }

        if (recordRes.code === 200 && recordRes.data?.list?.length) {
          const examId = examRes.data?.list?.[0]?.examId ?? examRes.data?.list?.[0]?.id
          const record = recordRes.data.list.find((r) => r.examId === examId)
          setExistingSessionCode(record?.status === 'in_progress' ? record.sessionCode : null)
          if (record?.status === 'completed') setPhase('done')
        } else {
          setExistingSessionCode(null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExistingSessionCode(null)
          message.error('加载测评失败，请刷新页面重试')
        }
      })
      .finally(() => { if (!cancelled) setEntryLoading(false) })

    return () => {
      cancelled = true
    }
  }, [phase])

  const handleStart = useCallback(async () => {
    setLoading(true)
    try {
      // 如果已有考试记录，则视为“继续测试”：先调用 resumeExam 恢复考试，然后再获取进度
      if (existingSessionCode) {
        const session = existingSessionCode
        const resumeRes = await resumeExam(session)
        if (resumeRes.code !== 200 || !resumeRes.data) {
          if (isGuestQuotaLimitMessage(resumeRes.message)) {
            setPhase('done')
            return
          }
          message.error(resumeRes.message || '恢复测试失败')
          return
        }

        const data = resumeRes.data
        if (data.isExamFinished || data.status === 'completed') {
          setPhase('done')
          return
        }
        const initialQuestion =
          data.currentQuestion ??
          data.firstQuestion ??
          null
        const normalized = initialQuestion
          ? normalizeQuestion(initialQuestion)
          : null

        setSessionCode(session)
        setQuestion(normalized)

        // 恢复后再查一次进度以拿到总题数等
        const progressRes = await getExamProgress(session)
        if (progressRes.code === 200 && progressRes.data) {
          const p = progressRes.data
          setTotalQuestions(p.totalQuestions ?? p.progress?.total ?? 0)
        }

        setPhase('testing')
        return
      }

      const examId = availableExamId
      if (!examId) {
        message.warning('暂无可用的测评')
        return
      }

      const res = await startExam(examId)
      if (res.code !== 200 || !res.data) {
        if (isGuestQuotaLimitMessage(res.message)) {
          setPhase('done')
          return
        }
        message.error(res.message || '开始考试失败')
        return
      }
      const data = res.data
      if (data.isExamFinished || data.status === 'completed') {
        setPhase('done')
        return
      }
      const session = data.sessionCode ?? null

      // 首次开始后立刻查询进度以获取总题数等信息
      if (session) {
        const progressRes = await getExamProgress(session)
        if (progressRes.code === 200 && progressRes.data) {
          const d = progressRes.data
          setTotalQuestions(d.totalQuestions ?? d.progress?.total ?? 0)
        }
      }

      const initialQuestion =
        data.currentQuestion ??
        data.firstQuestion ??
        null
      const normalized = initialQuestion
        ? normalizeQuestion(initialQuestion)
        : null

      setSessionCode(session)
      setQuestion(normalized)
      if (!session) {
        setTotalQuestions(normalized?.totalQuestions ?? 0)
      }
      setPhase('testing')
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : ''
      if (isGuestQuotaLimitMessage(errMsg)) {
        setPhase('done')
        return
      }
      message.error(errMsg || '开始考试失败')
    } finally {
      setLoading(false)
    }
  }, [availableExamId, existingSessionCode])

  const loadProgress = useCallback((code: string) => {
    getExamProgress(code).then((res) => {
      if (res.code === 200 && res.data) {
        const d = res.data
        setTotalQuestions(d.totalQuestions ?? d.progress?.total ?? 0)
      }
    })
  }, [])

  const handleSubmitAnswer = useCallback(
    (answer: string) => {
      if (!sessionCode || !question || submissionLockRef.current) return
      const questionIndex = question.questionIndex ?? 1
      submissionLockRef.current = true
      setSubmitError(null)
      setSubmitting(true)
      submitAnswer({
        sessionCode,
        questionId: question.questionId,
        questionIndex,
        answer,
      })
        .then((res) => {
          if (res.code !== 200 || !res.data) {
            throw new Error(res.message || '提交失败')
          }
          const data = res.data
          if (data.isExamFinished) {
            setPhase('done')
            setQuestion(null)
            return
          }
          if (data.nextQuestion) {
            const next = normalizeQuestion(
              data.nextQuestion
            )
            setQuestion(next)
            loadProgress(sessionCode)
          } else {
            setQuestion(null)
            loadProgress(sessionCode)
          }
        })
        .catch((e) => {
          setSubmitError(e instanceof Error ? e.message : '提交失败')
        })
        .finally(() => {
          submissionLockRef.current = false
          setSubmitting(false)
        })
    },
    [sessionCode, question, loadProgress]
  )

  // 题目变化时重置已选答案
  useEffect(() => {
    latestAnswerRef.current = ''
  }, [question?.questionId])

  // 单题时限与剩余时间均由后端随题目下发；倒计时按墙钟时间锚定，切题由前端驱动。
  // 续考时后端给出的剩余时间可能为 0，此时会立即提交空答案并进入下一题。
  const remainingSeconds = useQuestionCountdown({
    questionId: question?.questionId,
    totalSeconds: question?.timeLimitSeconds,
    remainingSeconds: question?.remainingSeconds,
    active: phase === 'testing' && !!question,
    onExpire: () => {
      // 后端按截止时间判定超时，过期提交会被记为空答。
      handleSubmitAnswer(latestAnswerRef.current || '')
    },
  })

  const handleFinish = useCallback(() => {
    if (!sessionCode || submissionLockRef.current) return
    submissionLockRef.current = true
    setSubmitting(true)
    finishExam(sessionCode)
      .then((res) => {
        if (res.code === 200 && res.data) {
          setPhase('done')
          setQuestion(null)
        } else {
          message.error(res.message || '交卷失败')
        }
      })
      .catch((e) => {
        message.error(e instanceof Error ? e.message : '交卷失败')
      })
      .finally(() => {
        submissionLockRef.current = false
        setSubmitting(false)
      })
  }, [sessionCode])

  if (phase === 'welcome') {
    return (
      <div style={{ width: '100%', minHeight: '100vh', margin: 0 }}>
        <GuestWelcomeScreen
          onStart={handleStart}
          loading={loading || entryLoading}
          hasRecord={!!existingSessionCode}
          recruitmentYear={recruitmentYear}
          recruitmentSeason={recruitmentSeason}
        />
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div style={{ width: '100%', minHeight: '100vh', margin: 0 }}>
        <GuestCompletionScreen recruitmentYear={recruitmentYear} />
      </div>
    )
  }

  if (phase === 'testing' && question) {
    return (
      <div style={{ width: '100%', minHeight: '100vh', margin: 0 }}>
        {submitError && (
          <Alert type="error" showIcon message={`答案提交失败：${submitError}`}
            action={<Button disabled={submitting} onClick={() => handleSubmitAnswer(latestAnswerRef.current)}>重试提交</Button>} />
        )}
        <GuestTestScreen
          key={question.questionId}
          question={question}
          totalQuestions={totalQuestions ?? question.totalQuestions ?? 0}
          countdownSeconds={remainingSeconds ?? undefined}
          onSubmit={handleSubmitAnswer}
          onAnswerChange={(answer) => {
            latestAnswerRef.current = answer
          }}
          onFinish={handleFinish}
          submitting={submitting}
        />
      </div>
    )
  }

  if (phase === 'testing' && !question && sessionCode) {
    return (
      <div
        style={{
          width: '100%',
          minHeight: '100vh',
          margin: 0,
          background: '#f0f4f8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <p style={{ marginBottom: 16, color: '#64748b' }}>当前没有题目，请交卷。</p>
          <Popconfirm
            title="确认提前交卷？"
            description="交卷后将结束本次测评，且无法继续作答。"
            okText="确认交卷"
            cancelText="继续作答"
            onConfirm={handleFinish}
            disabled={submitting}
          >
            <Button type="primary" loading={submitting} disabled={submitting}>
              交卷
            </Button>
          </Popconfirm>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f0f4f8',
      }}
    >
      <Spin size="large" />
    </div>
  )
}
