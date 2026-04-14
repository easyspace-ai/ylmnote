import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

class ErrorBoundaryInner extends Component<Props & { t: (k: string) => string }, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <h1 className="text-lg font-semibold text-gray-900">{this.props.t('errorTitle')}</h1>
          <p className="text-sm text-gray-600 max-w-md">{this.props.t('errorDescription')}</p>
          <button
            type="button"
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            onClick={() => window.location.reload()}
          >
            {this.props.t('retry')}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export function ErrorBoundary({ children }: Props) {
  const { t } = useTranslation()
  return <ErrorBoundaryInner t={t}>{children}</ErrorBoundaryInner>
}
