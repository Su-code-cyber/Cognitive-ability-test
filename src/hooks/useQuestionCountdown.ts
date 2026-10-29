import { useEffect, useRef, useState } from 'react'

const DEFAULT_TIME_LIMIT_SECONDS = 60

interface UseQuestionCountdownOptions {
  /** 当前题目 ID，切题时用于重新锚定截止时刻 */
  questionId?: string
  /** 本题总作答时长（秒），由后端随题目下发 */
  totalSeconds?: number
  /** 本题剩余作答时长（秒）。断点续考时小于总时长；缺省时按总时长处理 */
  remainingSeconds?: number
  /** 是否处于答题阶段；为 false 时停表 */
  active: boolean
  /** 本题倒计时归零时触发，每题只会触发一次 */
  onExpire: () => void
}

/** 把后端下发的秒数收敛为有限正整数，非法值回退到 fallback。 */
function toPositiveSeconds(value: unknown, fallback: number): number {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return fallback
  return Math.floor(seconds)
}

/**
 * 单题倒计时。以墙钟时间锚定截止时刻，每次 tick 用 Date.now() 重算而非递减，
 * 因此标签页被浏览器节流或挂起后回到前台会立即反映真实剩余时间，与后端的超时判定保持一致。
 */
export function useQuestionCountdown({
  questionId,
  totalSeconds,
  remainingSeconds,
  active,
  onExpire,
}: UseQuestionCountdownOptions): number | null {
  const [remaining, setRemaining] = useState<number | null>(null)

  // onExpire 存 ref：回调每次渲染都是新函数，不能让它重新锚定截止时刻。
  // 在 effect 中赋值而非渲染期赋值；本 effect 声明在倒计时 effect 之前，
  // 因此挂载时会先于倒计时的首次同步 tick 执行，回调不会是旧的。
  const onExpireRef = useRef(onExpire)
  useEffect(() => {
    onExpireRef.current = onExpire
  })

  // 记录已触发过 expire 的题目，保证每题只提交一次
  const expiredQuestionIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!active || !questionId) {
      return
    }

    const limit = toPositiveSeconds(totalSeconds, DEFAULT_TIME_LIMIT_SECONDS)
    // remainingSeconds 为 0 是合法值（续考时本题已超时），因此不能走 toPositiveSeconds。
    // null/undefined（含尚未支持该字段的旧后端）按完整时限处理，失败方向偏向候选人；
    // 负值钳制为 0，避免异常入参反而多给作答时间。
    const reportedRemaining = Number(remainingSeconds)
    const initialRemaining =
      remainingSeconds != null && Number.isFinite(reportedRemaining)
        ? Math.min(limit, Math.max(0, Math.floor(reportedRemaining)))
        : limit
    const deadline = Date.now() + initialRemaining * 1000

    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setRemaining(left)
      if (left > 0) return
      if (expiredQuestionIdRef.current === questionId) return
      expiredQuestionIdRef.current = questionId
      onExpireRef.current()
    }

    // 先同步执行一次，避免首帧空白，也让续考时已超时的题目立即推进
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
    // 只依赖锚点：questionId 决定何时重新计时，active 决定是否计时。
    // 刻意不依赖 onExpire / submitting 之类的瞬时值，否则截止时刻会被反复重置。
  }, [questionId, totalSeconds, remainingSeconds, active])

  return active && questionId ? remaining : null
}
