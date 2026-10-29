import { Progress } from 'antd'
import { CompassOutlined } from '@ant-design/icons'
import { guestExamTheme } from './guestExamTheme'
import logoCampus from '@/assets/logo-campus.png'

interface GuestProgressHeaderProps {
  currentQuestion: number
  totalQuestions: number
}

export default function GuestProgressHeader({ currentQuestion, totalQuestions }: GuestProgressHeaderProps) {
  const percent = totalQuestions ? Math.round((currentQuestion / totalQuestions) * 100) : 0

  return (
    <div
      style={{
        width: '100%',
        background: guestExamTheme.surface,
        borderBottom: `1px solid ${guestExamTheme.border}`,
        boxShadow: '0 1px 3px rgba(15, 52, 96, 0.06)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: '0 auto',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 20,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <img
            src={logoCampus}
            alt="BlueFocus 校招"
            style={{ height: 24, width: 'auto', objectFit: 'contain', display: 'block' }}
          />
          <span
            style={{
              fontSize: 13,
              color: guestExamTheme.textMuted,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <CompassOutlined style={{ color: guestExamTheme.primary }} />
            测评进行中
          </span>
        </div>
        <span
          style={{
            fontSize: 13,
            color: guestExamTheme.textMuted,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          第 <strong style={{ color: guestExamTheme.text }}>{currentQuestion}</strong> / {totalQuestions} 题
        </span>
      </div>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px 14px' }}>
        <Progress
          percent={percent}
          showInfo={false}
          strokeColor={{ '0%': guestExamTheme.primaryDark, '100%': guestExamTheme.primary }}
          trailColor="#e2e8f0"
          strokeWidth={6}
          style={{ marginBottom: 0 }}
        />
      </div>
    </div>
  )
}
