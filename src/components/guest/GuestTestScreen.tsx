import { useState, useCallback } from 'react'
import { Card, Button, Radio, Checkbox, Popconfirm } from 'antd'
import type { CurrentQuestionResult } from '@/api/examApi'
import SafeHtmlContent from '@/components/exam/SafeHtmlContent'
import GuestProgressHeader from './GuestProgressHeader'
import { ArrowRightOutlined, LogoutOutlined } from '@ant-design/icons'
import { guestExamTheme } from './guestExamTheme'

const pageWrap: React.CSSProperties = {
  width: '100%',
  minHeight: '100vh',
  margin: 0,
  boxSizing: 'border-box',
  background: guestExamTheme.pageBg,
}

interface GuestTestScreenProps {
  question: CurrentQuestionResult
  totalQuestions: number
  countdownSeconds?: number
  onSubmit: (answer: string) => void
  onAnswerChange: (answer: string) => void
  onFinish: () => void
  submitting: boolean
}

export default function GuestTestScreen({
  question,
  totalQuestions,
  countdownSeconds,
  onSubmit,
  onAnswerChange,
  onFinish,
  submitting,
}: GuestTestScreenProps) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const questionIndex = question.questionIndex ?? 1
  const optionKeys = question.optionKeys ?? []
  const options = question.options ?? {}

  const handleSubmit = useCallback(() => {
    if (submitting) return
    const answer =
      question.questionType === 1 ? selectedKeys.slice().sort().join(',') : (selectedKeys[0] ?? '')
    if (question.questionType === 1 && selectedKeys.length === 0) return
    if (question.questionType !== 1 && !selectedKeys[0]) return
    onSubmit(answer)
    setSelectedKeys([])
    onAnswerChange('')
  }, [selectedKeys, question.questionType, onSubmit, submitting, onAnswerChange])

  const isLast = totalQuestions > 0 && questionIndex >= totalQuestions
  const warningSeconds = question.unansweredWarningSeconds ?? 10
  const timerWarn =
    typeof countdownSeconds === 'number' &&
    countdownSeconds > 0 &&
    countdownSeconds <= warningSeconds &&
    selectedKeys.length === 0

  return (
    <div style={pageWrap}>
      <GuestProgressHeader currentQuestion={questionIndex} totalQuestions={totalQuestions || 1} />

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px 48px' }}>
        <Card
          className={timerWarn ? 'guest-exam-answer-warning' : undefined}
          bordered={false}
          style={{
            background: guestExamTheme.surface,
            borderRadius: 12,
            border: `1px solid ${guestExamTheme.border}`,
            boxShadow: '0 4px 24px rgba(15, 52, 96, 0.06)',
          }}
          styles={{ body: { padding: '28px 28px 24px' } }}
        >
          <div
            style={{
              marginBottom: 22,
              paddingBottom: 20,
              borderBottom: `1px solid ${guestExamTheme.border}`,
            }}
          >
            <p style={{ fontSize: 12, color: guestExamTheme.textMuted, margin: '0 0 8px', fontWeight: 500 }}>
              {question.questionType === 1 ? '多选题' : '单选题'}
              {question.difficulty ? ` · 难度 ${question.difficulty}` : ''}
            </p>
            <div style={{ fontSize: 17, fontWeight: 600, color: guestExamTheme.text, lineHeight: 1.65, margin: 0 }}>
              <SafeHtmlContent html={question.content} />
            </div>
          </div>

          {question.questionType === 1 ? (
            <Checkbox.Group
              value={selectedKeys}
              onChange={(vals) => {
                const next = (vals as string[]).slice()
                setSelectedKeys(next)
                const answer = next.slice().sort().join(',')
                onAnswerChange(answer)
              }}
              style={{ width: '100%', display: 'block' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {optionKeys.map((key) => {
                  const active = selectedKeys.includes(key)
                  return (
                    <div
                      key={key}
                      onClick={(event) => {
                        if (submitting || (event.target as HTMLElement).closest('.ant-checkbox-wrapper')) return
                        const next = active
                          ? selectedKeys.filter((value) => value !== key)
                          : [...selectedKeys, key]
                        setSelectedKeys(next)
                        onAnswerChange(next.slice().sort().join(','))
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '14px 16px',
                        borderRadius: 10,
                        border: `1.5px solid ${active ? guestExamTheme.primary : guestExamTheme.border}`,
                        background: active ? 'rgba(26, 77, 122, 0.06)' : '#fafafa',
                        cursor: submitting ? 'not-allowed' : 'pointer',
                        transition: 'border-color 0.15s, background 0.15s',
                      }}
                    >
                      <span
                        style={{
                          flexShrink: 0,
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          background: active
                            ? `linear-gradient(135deg, ${guestExamTheme.primaryDark}, ${guestExamTheme.primary})`
                            : '#f1f5f9',
                          color: active ? '#fff' : '#64748b',
                          fontSize: 13,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {key}
                      </span>
                      <span style={{ fontSize: 14, color: '#334155', flex: 1, lineHeight: 1.55 }}>
                        {options[key]?.trim() ? (
                          <SafeHtmlContent html={options[key]} style={{ display: 'inline-block' }} />
                        ) : (
                          key
                        )}
                      </span>
                      <span
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 30 }}
                      >
                        <Checkbox value={key} disabled={submitting} aria-label={key} />
                      </span>
                    </div>
                  )
                })}
              </div>
            </Checkbox.Group>
          ) : (
            <Radio.Group
              value={selectedKeys[0]}
              onChange={(e) => {
                if (submitting) return
                const value = e.target.value
                const next = value ? [value] : []
                setSelectedKeys(next)
                onAnswerChange(next[0] ?? '')
              }}
              style={{ width: '100%', display: 'block' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {optionKeys.map((key) => {
                  const isSelected = selectedKeys[0] === key
                  return (
                    <div
                      key={key}
                      onClick={(event) => {
                        if (submitting || (event.target as HTMLElement).closest('.ant-radio-wrapper')) return
                        setSelectedKeys([key])
                        onAnswerChange(key)
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '14px 16px',
                        borderRadius: 10,
                        border: `1.5px solid ${isSelected ? guestExamTheme.primary : guestExamTheme.border}`,
                        background: isSelected ? 'rgba(26, 77, 122, 0.06)' : '#fafafa',
                        cursor: submitting ? 'not-allowed' : 'pointer',
                        transition: 'border-color 0.15s, background 0.15s',
                      }}
                    >
                      <span
                        style={{
                          flexShrink: 0,
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          background: isSelected
                            ? `linear-gradient(135deg, ${guestExamTheme.primaryDark}, ${guestExamTheme.primary})`
                            : '#f1f5f9',
                          color: isSelected ? '#fff' : '#64748b',
                          fontSize: 13,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {key}
                      </span>
                      <span style={{ fontSize: 14, color: '#334155', flex: 1, lineHeight: 1.55 }}>
                        {options[key]?.trim() ? (
                          <SafeHtmlContent html={options[key]} style={{ display: 'inline-block' }} />
                        ) : (
                          key
                        )}
                      </span>
                      <span
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 30 }}
                      >
                        <Radio value={key} disabled={submitting} aria-label={key} />
                      </span>
                    </div>
                  )
                })}
              </div>
            </Radio.Group>
          )}

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              marginTop: 28,
              paddingTop: 20,
              borderTop: `1px solid ${guestExamTheme.border}`,
            }}
          >
            <div
              className={timerWarn ? 'guest-exam-timer-warning' : undefined}
              role={timerWarn ? 'alert' : undefined}
              aria-live="polite"
              style={{
                fontSize: 14,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
                color: timerWarn ? '#dc2626' : guestExamTheme.textMuted,
                minWidth: 120,
                padding: timerWarn ? '6px 10px' : '6px 0',
                borderRadius: 8,
              }}
            >
              {typeof countdownSeconds === 'number' ? (
                <>
                  剩余{' '}
                  <span style={{ fontSize: 18, color: timerWarn ? '#dc2626' : guestExamTheme.text }}>
                    {countdownSeconds}
                  </span>
                  {' '}秒
                </>
              ) : (
                <span style={{ fontWeight: 500, color: '#94a3b8' }}>—</span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
              {!isLast && (
                <Popconfirm
                  title="确认提前交卷？"
                  description="交卷后将结束本次测评，且无法继续作答。"
                  okText="确认交卷"
                  cancelText="继续作答"
                  onConfirm={onFinish}
                  disabled={submitting}
                >
                  <Button
                    icon={<LogoutOutlined />}
                    disabled={submitting}
                    style={{ color: guestExamTheme.textMuted, borderColor: '#cbd5e1' }}
                  >
                    交卷
                  </Button>
                </Popconfirm>
              )}
              <Button
                type="primary"
                onClick={handleSubmit}
                disabled={
                  submitting || (question.questionType === 1 ? selectedKeys.length === 0 : !selectedKeys[0])
                }
                loading={submitting}
                icon={<ArrowRightOutlined />}
                size="large"
                style={{
                  minWidth: 132,
                  height: 42,
                  fontWeight: 600,
                  color: '#ffffff',
                  background: `linear-gradient(135deg, ${guestExamTheme.primaryDark} 0%, ${guestExamTheme.primary} 100%)`,
                  border: 'none',
                  boxShadow: '0 4px 14px rgba(15, 52, 96, 0.35)',
                }}
              >
                {isLast ? '提交并完成' : '下一题'}
              </Button>
            </div>
          </div>
        </Card>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', marginTop: 20 }}>
          认真审题，不确定时可先排除明显错误选项
        </p>
      </div>
    </div>
  )
}
