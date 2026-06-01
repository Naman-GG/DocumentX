import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/** Catches render errors in the editor subtree so a single failure doesn't blank the app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <AlertTriangle size={32} className="text-amber" />
          <h2 className="text-lg font-semibold text-text-primary">Something went wrong</h2>
          <p className="max-w-sm text-sm text-text-secondary">
            The editor hit an unexpected error. Reloading the page usually fixes it — your
            document is safely stored on the server.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
