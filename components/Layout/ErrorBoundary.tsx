import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  private unhandledRejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

  constructor(props: Props) {
    super(props);
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidMount() {
    // Log unhandled promise rejections without replacing the entire UI.
    // Transient failures (API calls, network errors) should not crash the app.
    // Only synchronous render errors trigger the error boundary fallback UI.
    this.unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
    };
    window.addEventListener('unhandledrejection', this.unhandledRejectionHandler);
  }

  public componentWillUnmount() {
    if (this.unhandledRejectionHandler) {
      window.removeEventListener('unhandledrejection', this.unhandledRejectionHandler);
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-10 border border-slate-100 text-center">
            <div className="inline-flex items-center justify-center p-4 bg-red-50 rounded-2xl mb-6">
              <AlertCircle className="h-10 w-10 text-red-600" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 mb-4">Something went wrong</h1>
            <p className="text-slate-500 font-medium mb-8 leading-relaxed">
              We encountered an unexpected error. Don't worry, your project data is safe.
            </p>
            <div className="bg-slate-50 p-4 rounded-xl mb-8 text-left overflow-auto max-h-32">
              <code className="text-[10px] text-red-500 font-mono">
                {this.state.error?.message}
              </code>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-green-700 text-white py-4 rounded-xl font-black text-lg flex items-center justify-center hover:bg-green-800 transition-all shadow-xl shadow-green-900/10"
            >
              <RefreshCcw className="h-5 w-5 mr-2" />
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
