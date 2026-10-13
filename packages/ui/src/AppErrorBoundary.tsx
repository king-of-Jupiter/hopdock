import { Component } from 'react';
import type { ReactNode } from 'react';
import { ErrorNotice } from './ErrorNotice';

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="hd-app hd-fatal-screen" data-theme={localStorage.getItem('hopdock.theme') === 'dark' ? 'dark' : 'light'}><div><h1 className="hd-page-title">Hopdock needs to reload</h1><ErrorNotice error="Application window is unavailable" context="Render interface" onRetry={() => window.location.reload()} /></div></div>;
  }
}
