import { useState, useCallback, createContext, useContext, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/utils'

// Dialog 类型
type DialogType = 'confirm' | 'prompt' | 'alert'

interface DialogState {
  isOpen: boolean
  type: DialogType
  title: string
  message?: string
  defaultValue?: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'default'
  resolve: ((value: boolean | string | null) => void) | null
}

interface DialogContextType {
  confirm: (options: Omit<DialogOptions, 'type'>) => Promise<boolean>
  prompt: (options: Omit<PromptDialogOptions, 'type'>) => Promise<string | null>
  alert: (options: Omit<AlertOptions, 'type'>) => Promise<void>
}

interface DialogOptions {
  type: DialogType
  title: string
  message?: string
  defaultValue?: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'default'
}

interface PromptDialogOptions extends DialogOptions {
  defaultValue?: string
  placeholder?: string
}

interface AlertOptions {
  type: 'alert'
  title: string
  message?: string
  confirmText?: string
}

const DialogContext = createContext<DialogContextType | null>(null)

export function useDialog() {
  const context = useContext(DialogContext)
  if (!context) {
    throw new Error('useDialog must be used within DialogProvider')
  }
  return context
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>({
    isOpen: false,
    type: 'confirm',
    title: '',
    message: '',
    defaultValue: '',
    placeholder: '',
    confirmText: '确认',
    cancelText: '取消',
    variant: 'default',
    resolve: null,
  })

  const resolveRef = useRef<((value: boolean | string | null) => void) | null>(null)

  const confirm = useCallback((options: Omit<DialogOptions, 'type'>): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setDialog({
        isOpen: true,
        type: 'confirm',
        title: options.title,
        message: options.message,
        confirmText: options.confirmText || '确认',
        cancelText: options.cancelText || '取消',
        variant: options.variant || 'default',
        resolve,
      })
    })
  }, [])

  const prompt = useCallback((options: Omit<PromptDialogOptions, 'type'>): Promise<string | null> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setDialog({
        isOpen: true,
        type: 'prompt',
        title: options.title,
        message: options.message,
        defaultValue: options.defaultValue || '',
        placeholder: options.placeholder || '',
        confirmText: options.confirmText || '确认',
        cancelText: options.cancelText || '取消',
        variant: 'default',
        resolve,
      })
    })
  }, [])

  const alert = useCallback((options: Omit<AlertOptions, 'type'>): Promise<void> => {
    return new Promise((resolve) => {
      resolveRef.current = () => {
        resolve()
        return null
      }
      setDialog({
        isOpen: true,
        type: 'alert',
        title: options.title,
        message: options.message,
        confirmText: options.confirmText || '确定',
        cancelText: '',
        variant: 'default',
        resolve: resolveRef.current,
      })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    if (resolveRef.current) {
      if (dialog.type === 'prompt') {
        const input = document.getElementById('dialog-input') as HTMLInputElement
        resolveRef.current(input?.value || '')
      } else {
        resolveRef.current(true)
      }
    }
    setDialog((prev) => ({ ...prev, isOpen: false }))
  }, [dialog.type])

  const handleCancel = useCallback(() => {
    if (resolveRef.current) {
      resolveRef.current(dialog.type === 'prompt' ? null : false)
    }
    setDialog((prev) => ({ ...prev, isOpen: false }))
  }, [dialog.type])

  const handleClose = useCallback(() => {
    if (resolveRef.current) {
      resolveRef.current(dialog.type === 'prompt' ? null : false)
    }
    setDialog((prev) => ({ ...prev, isOpen: false }))
  }, [dialog.type])

  // 处理键盘事件
  useEffect(() => {
    if (!dialog.isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel()
      } else if (e.key === 'Enter') {
        if (dialog.type === 'prompt') {
          handleConfirm()
        } else if (dialog.type === 'confirm') {
          handleConfirm()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dialog.isOpen, dialog.type, handleConfirm, handleCancel])

  return (
    <DialogContext.Provider value={{ confirm, prompt, alert }}>
      {children}
      {dialog.isOpen && (
        <DialogOverlay
          type={dialog.type}
          title={dialog.title}
          message={dialog.message}
          defaultValue={dialog.defaultValue}
          placeholder={dialog.placeholder}
          confirmText={dialog.confirmText}
          cancelText={dialog.cancelText}
          variant={dialog.variant}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          onClose={handleClose}
        />
      )}
    </DialogContext.Provider>
  )
}

// Dialog 覆盖层组件
interface DialogOverlayProps {
  type: DialogType
  title: string
  message?: string
  defaultValue?: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'default'
  onConfirm: () => void
  onCancel: () => void
  onClose: () => void
}

function DialogOverlay({
  type,
  title,
  message,
  defaultValue,
  placeholder,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'default',
  onConfirm,
  onCancel,
}: DialogOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (type === 'prompt' && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [type])

  const buttonStyles = {
    danger: 'bg-red-500 text-white hover:bg-red-600',
    warning: 'bg-amber-500 text-white hover:bg-amber-600',
    default: 'bg-primary-600 text-white hover:bg-primary-700',
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 m-4 animate-scale-in">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          {message && <p className="text-sm text-gray-500 mt-1">{message}</p>}
        </div>

        {type === 'prompt' && (
          <div className="mb-5">
            <input
              ref={inputRef}
              id="dialog-input"
              type="text"
              defaultValue={defaultValue}
              placeholder={placeholder}
              className="w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all"
            />
          </div>
        )}

        <div className="flex justify-end gap-3">
          {type !== 'alert' && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={cn('px-4 py-2 text-sm font-medium rounded-xl transition-colors', buttonStyles[variant])}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

// 模态框组件（用于新建项目等）
interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  maxWidth?: string
}

export function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-md' }: ModalProps) {
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative bg-white w-full rounded-2xl shadow-2xl m-4 animate-scale-in', maxWidth)}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
