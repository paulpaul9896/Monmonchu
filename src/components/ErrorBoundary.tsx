import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-rose-50 p-6">
          <div className="max-w-md w-full bg-white p-8 rounded-[40px] shadow-2xl border border-rose-100">
            <h1 className="text-2xl font-black text-rose-600 mb-4 tracking-tighter">Oops! 系統發生錯誤 😵</h1>
            <p className="text-slate-600 text-sm mb-6 leading-relaxed">
              很抱歉，應用程式在運行時遇到了問題。請嘗試重新整理頁面。
            </p>
            <div className="p-4 bg-slate-50 rounded-2xl overflow-auto max-h-40">
              <code className="text-[10px] font-mono text-rose-500 whitespace-pre">
                {this.state.error?.toString()}
              </code>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full mt-6 py-4 bg-slate-900 text-white rounded-3xl font-black uppercase tracking-widest text-xs"
            >
              重新整理
            </button>
          </div>
        </div>
      );
    }

    return this.children;
  }
}
