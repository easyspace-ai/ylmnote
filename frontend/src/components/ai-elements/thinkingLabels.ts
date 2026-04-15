/**
 * 上游 Cozor 帧 kind → 展示用文案与样式 key（与 backend classifyUpstreamKind 对齐）
 */
import type { ChatMessage } from './types'

export type ThinkingStepTone = 'system' | 'reasoning' | 'internal' | 'subliminal' | 'generic'

export function getThinkingStepTone(msg: ChatMessage): ThinkingStepTone {
  const k = (msg.upstreamKind || '').toLowerCase().trim()
  if (msg.messageKind === 'system' || k === 'system') return 'system'
  if (k === 'internal_thought') return 'internal'
  if (k === 'subliminal_thought') return 'subliminal'
  if (k === 'reasoning' || msg.messageKind === 'reasoning') return 'reasoning'
  return 'generic'
}

export function getThinkingStepLabel(msg: ChatMessage): string {
  const tone = getThinkingStepTone(msg)
  switch (tone) {
    case 'system':
      return '系统'
    case 'reasoning':
      return '推理'
    case 'internal':
      return '内部思考'
    case 'subliminal':
      return '隐性思考'
    default:
      return '过程'
  }
}

/** 折叠卡片标题旁：各类型条数摘要，如「推理 8 · 内部 3」 */
export function summarizeUpstreamKinds(steps: ChatMessage[]): string {
  const counts: Record<string, number> = {}
  for (const s of steps) {
    const tone = getThinkingStepTone(s)
    const key =
      tone === 'system'
        ? '系统'
        : tone === 'reasoning'
          ? '推理'
          : tone === 'internal'
            ? '内部'
            : tone === 'subliminal'
              ? '隐性'
              : '其它'
    counts[key] = (counts[key] || 0) + 1
  }
  const order = ['推理', '内部', '隐性', '系统', '其它']
  const parts: string[] = []
  for (const name of order) {
    const n = counts[name]
    if (n) parts.push(`${name} ${n}`)
  }
  return parts.join(' · ')
}
