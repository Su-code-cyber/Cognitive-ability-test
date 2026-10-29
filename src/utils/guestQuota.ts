/** 与后端配额错误文案对齐（测评接口返回信息含「已达上限」）。 */
export function isGuestQuotaLimitMessage(message: string | null | undefined): boolean {
    if (!message) return false
    return message.includes('已达上限') || message.includes('个月内最多参加')
}
