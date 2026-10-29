import DOMPurify from 'dompurify'

/** 与题库展示组件 SafeHtmlContent 一致，限制 Quill 富文本标签/属性 */
const EXAM_RICH_HTML_SANITIZE: Parameters<typeof DOMPurify.sanitize>[1] = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'span',
    'div',
    'h1',
    'h2',
    'h3',
    'h4',
    'ul',
    'ol',
    'li',
    'blockquote',
    'a',
    'img',
    'hr',
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style', 'target', 'rel'],
  ADD_ATTR: ['target'],
}

export function sanitizeExamRichHtml(html: string): string {
  return DOMPurify.sanitize(html ?? '', EXAM_RICH_HTML_SANITIZE)
}
