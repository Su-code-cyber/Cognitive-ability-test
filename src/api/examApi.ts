import { get, post } from '@/utils/ApiUtils'
import { EXAM_API } from '@/constants/apiPaths'

interface PageRequest {
  pageNum: number
  pageSize: number
}

interface AvailableExamPageResult {
  list: { examId?: string; id?: string }[]
}

interface StartExamResult {
  sessionCode: string
  status?: 'in_progress' | 'completed'
  isExamFinished?: boolean
  firstQuestion?: Record<string, unknown>
  currentQuestion?: Record<string, unknown>
}

export interface CurrentQuestionResult {
  questionId: string
  content: string
  questionType: number
  difficulty?: number
  optionKeys: string[]
  options: Record<string, string>
  questionIndex?: number
  totalQuestions?: number
  timeLimitSeconds?: number
  remainingSeconds?: number
  unansweredWarningSeconds?: number
}

interface SubmitAnswerRequest {
  sessionCode: string
  /** 保持字符串以避免大整数精度丢失。 */
  questionId: string
  questionIndex: number
  /** 单选传 "A"，多选传排序后的 "A,B"。 */
  answer: string
}

interface SubmitAnswerResult {
  nextQuestion?: Record<string, unknown>
  isExamFinished?: boolean
}

interface ExamProgressResult {
  totalQuestions?: number
  progress?: { total?: number }
}

interface ExamRecordPageResult {
  list: { sessionCode: string; examId: string; status: 'in_progress' | 'completed' }[]
}

export function getAvailableExams({ pageNum, pageSize }: PageRequest) {
  return post<AvailableExamPageResult>(EXAM_API.getAvailableExams, {
    curPage: pageNum,
    pageSize,
    params: {},
  })
}

export function startExam(examId: string) {
  return post<StartExamResult>(EXAM_API.startExam, { examId })
}

export function submitAnswer(body: SubmitAnswerRequest) {
  return post<SubmitAnswerResult>(EXAM_API.submitAnswer, body)
}

export function getExamProgress(sessionCode: string) {
  return get<ExamProgressResult>(EXAM_API.getExamProgress, { sessionCode })
}

export function resumeExam(sessionCode: string, signal?: AbortSignal) {
  return post<StartExamResult>(EXAM_API.resumeExam, { sessionCode }, { signal, quietNetworkError: !!signal })
}

export function examHeartbeat(sessionCode: string, questionId: string, questionIndex: number, signal: AbortSignal) {
  return post<StartExamResult>(EXAM_API.heartbeat, { sessionCode, questionId, questionIndex }, {
    signal, quietNetworkError: true,
  })
}

export function finishExam(sessionCode: string) {
  return post(EXAM_API.finishExam, { sessionCode })
}

export function getMyExamRecords({ pageNum, pageSize }: PageRequest) {
  return post<ExamRecordPageResult>(EXAM_API.getMyExamRecords, {
    curPage: pageNum,
    pageSize,
    params: {},
  })
}
