/**
 * SkillSelector - 技能选择器组件
 */

import { useState } from 'react'
import { cn } from '@/utils'
import { Zap, X, Check } from 'lucide-react'
import type { Skill } from './types'

interface SkillSelectorProps {
  skills: Skill[]
  selectedSkill: string | null
  onSelect: (skillId: string | null) => void
  className?: string
}

export function SkillSelector({
  skills,
  selectedSkill,
  onSelect,
  className,
}: SkillSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const selected = skills.find((s) => s.id === selectedSkill)

  return (
    <div className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200',
          selectedSkill
            ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
            : 'border-gray-200 bg-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
        )}
      >
        <Zap size={12} className={selectedSkill ? 'text-indigo-500' : 'text-gray-400'} />
        <span>{selected ? selected.name : '技能'}</span>
        {selected && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onSelect(null)
            }}
            className="ml-0.5 p-0.5 hover:bg-indigo-100 rounded transition-colors"
          >
            <X size={10} />
          </button>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 bottom-full mb-2 bg-white rounded-xl border border-gray-100 shadow-xl shadow-gray-900/10 z-20 min-w-[180px] max-h-[240px] overflow-y-auto py-1">
            {skills.length > 0 ? (
              skills.map((skill) => (
                <button
                  key={skill.id}
                  onClick={() => {
                    onSelect(skill.id)
                    setIsOpen(false)
                  }}
                  className={cn(
                    'flex items-center justify-between gap-2 w-full px-4 py-2 text-sm text-left hover:bg-gray-50 transition-colors',
                    selectedSkill === skill.id && 'bg-indigo-50 text-indigo-700'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-base">{skill.icon}</span>
                    <span>{skill.name}</span>
                  </span>
                  {selectedSkill === skill.id && (
                    <Check size={13} className="text-indigo-500" />
                  )}
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-sm text-gray-400">暂无已安装技能</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
