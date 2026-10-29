const PREFIX = '/api/blue/bluecommonservice'

export const AUTH_API = {
  LOGIN: `${PREFIX}/auth/login`,
  REGISTER: `${PREFIX}/auth/register`,
  REFRESH: `${PREFIX}/auth/refresh`,
  LOGOUT: `${PREFIX}/auth/logout`,
  ME: `${PREFIX}/auth/me`,
} as const

export const EXAM_API = {
  getAvailableExams: `${PREFIX}/exam/getAvailableExams`,
  startExam: `${PREFIX}/exam/startExam`,
  submitAnswer: `${PREFIX}/exam/submitAnswer`,
  getExamProgress: `${PREFIX}/exam/getExamProgress`,
  resumeExam: `${PREFIX}/exam/resumeExam`,
  finishExam: `${PREFIX}/exam/finishExam`,
  getMyExamRecords: `${PREFIX}/exam/getMyExamRecords`,
} as const
