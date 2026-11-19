import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public handleReload = () => {
    window.location.reload();
  };

  public handleNavigateHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] w-full flex-col items-center justify-center p-6 text-center select-none">
          <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/10 text-destructive shadow-lg shadow-destructive/10">
            <AlertTriangle className="h-8 w-8 text-amber-500 animate-pulse" />
          </div>

          <h2 className="mb-2 text-xl font-bold tracking-tight text-foreground">
            {this.props.fallbackTitle || 'Something went wrong during replay execution'}
          </h2>

          <p className="max-w-md mb-6 text-sm text-muted-foreground leading-relaxed">
            {this.state.error?.message ||
              'A runtime exception interrupted the view. Your local database and saved states remain intact.'}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-md active:scale-95"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try Again
            </button>

            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-border bg-card hover:bg-accent text-foreground transition-all active:scale-95"
            >
              Reload Page
            </button>

            <button
              onClick={this.handleNavigateHome}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-border/60 hover:bg-accent text-muted-foreground hover:text-foreground transition-all active:scale-95"
            >
              <Home className="h-3.5 w-3.5" />
              Return Home
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
