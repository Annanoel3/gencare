import React from 'react';
import { track } from '@/lib/activity';

/**
 * If a screen crashes, show a way back instead of a blank white page, and log
 * what broke (for the App activity page).
 */
export default class CrashScreen extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const where = String(info?.componentStack || '').split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
    track('error', 'screen crashed', `${error?.message || error} ${where}`.trim());
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif', background: '#FAF8F5', color: '#1E2B23' }}>
        <div style={{ maxWidth: 340, textAlign: 'center' }}>
          <p style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Something went wrong</p>
          <p style={{ fontSize: 15, color: '#5b6b62', margin: '0 0 20px' }}>Nothing you added is lost. Tap below to open GenCare again.</p>
          <button type="button" onClick={() => { window.location.href = '/'; }} style={{ background: '#4E9A72', color: 'white', border: 0, borderRadius: 12, padding: '12px 24px', fontSize: 16, fontWeight: 600 }}>Open GenCare</button>
        </div>
      </div>
    );
  }
}
