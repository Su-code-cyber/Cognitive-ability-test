import type { CSSProperties } from 'react'
import { sanitizeExamRichHtml } from '@/utils/examRichHtmlSanitize'

interface SafeHtmlContentProps {
  html: string
  style?: CSSProperties
}

/** 展示题库/考试中的 HTML（Quill 输出），需与编辑端分开清洗 */
export default function SafeHtmlContent({ html, style }: SafeHtmlContentProps) {
  if (!html?.trim()) return null
  const clean = sanitizeExamRichHtml(html)
  return (
    <div
      className="exam-safe-html-content"
      style={style}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}
