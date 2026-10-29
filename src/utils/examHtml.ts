/** 认知测试题目：合并材料、题干及图片。 */
function extractImageUrlsFromHtml(...htmlParts: (string | undefined | null)[]): string[] {
  const urls = new Set<string>()
  if (typeof DOMParser === 'undefined') return []
  const parser = new DOMParser()
  for (const html of htmlParts) {
    if (!html?.trim()) continue
    const doc = parser.parseFromString(html, 'text/html')
    doc.querySelectorAll('img[src]').forEach((img) => {
      const src = img.getAttribute('src')
      if (src && !src.startsWith('data:')) urls.add(src)
    })
  }
  return [...urls]
}

/** 将考试接口返回的题目字段合并为一段用于展示的 HTML（材料在上、题干在下；附加未嵌入正文的 imageUrls） */
export function combineQuestionDisplayHtml(raw: Record<string, unknown>): string {
  const material = String(raw.questionMaterial ?? '').trim()
  const stem = String(raw.questionStem ?? '').trim()
  const legacyContent = String(raw.content ?? '').trim()

  let html: string
  if (legacyContent && !stem && !material) {
    html = legacyContent
  } else if (material && stem) {
    html = `${material}<div class="exam-q-sep" style="margin:12px 0"></div>${stem}`
  } else {
    html = stem || material || legacyContent
  }

  const extra = Array.isArray(raw.imageUrls) ? (raw.imageUrls as unknown[]) : []
  const embedded = new Set(extractImageUrlsFromHtml(html))
  const append: string[] = []
  for (const u of extra) {
    if (typeof u !== 'string' || !u.trim()) continue
    if (embedded.has(u)) continue
    const safe = u.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
    append.push(`<p><img src="${safe}" alt="" /></p>`)
    embedded.add(u)
  }
  if (append.length) html += append.join('')
  return html
}
