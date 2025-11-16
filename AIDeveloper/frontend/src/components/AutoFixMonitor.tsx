/**
 * AutoFixMonitor Component
 * Real-time monitoring dashboard for auto-fix operations
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './AutoFixMonitor.css';

interface AutoFixProgress {
  stage: string;
  percentage: number;
  message: string;
}

interface AutoFixAttempt {
  id: string;
  workflowId: number;
  timestamp: string;
  startedAt: string;
  completedAt?: string;
  duration?: number;
  status: 'pending' | 'running' | 'investigating' | 'fixing' | 'testing' | 'success' | 'failed';
  error?: string;
  pid?: number;
  rootCause?: string;
  fixDescription?: string;
  commitHash?: string;
  newWorkflowId?: number;
  progress?: AutoFixProgress;
}

interface AutoFixSummary {
  totalAttempts: number;
  activeAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  recentAttempts: AutoFixAttempt[];
}

const AutoFixMonitor: React.FC = () => {
  const [summary, setSummary] = useState<AutoFixSummary | null>(null);
  const [activeAttempts, setActiveAttempts] = useState<AutoFixAttempt[]>([]);
  const [history, setHistory] = useState<AutoFixAttempt[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState<AutoFixAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  /**
   * Fetch auto-fix summary
   */
  const fetchSummary = async () => {
    try {
      const response = await axios.get('/api/auto-fix/summary');
      setSummary(response.data);
    } catch (error) {
      console.error('Failed to fetch auto-fix summary:', error);
    }
  };

  /**
   * Fetch active auto-fix attempts
   */
  const fetchActiveAttempts = async () => {
    try {
      const response = await axios.get('/api/auto-fix/active');
      setActiveAttempts(response.data.attempts);
    } catch (error) {
      console.error('Failed to fetch active attempts:', error);
    }
  };

  /**
   * Fetch auto-fix history
   */
  const fetchHistory = async () => {
    try {
      const response = await axios.get('/api/auto-fix/history?limit=20');
      setHistory(response.data.attempts);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  };

  /**
   * Fetch specific attempt details
   */
  const fetchAttemptDetails = async (attemptId: string) => {
    try {
      const response = await axios.get(`/api/auto-fix/${attemptId}`);
      setSelectedAttempt(response.data.attempt);
    } catch (error) {
      console.error('Failed to fetch attempt details:', error);
    }
  };

  /**
   * Refresh all data
   */
  const refreshData = async () => {
    setLoading(true);
    await Promise.all([
      fetchSummary(),
      fetchActiveAttempts(),
      fetchHistory()
    ]);
    setLoading(false);
  };

  /**
   * Initial data load
   */
  useEffect(() => {
    refreshData();
  }, []);

  /**
   * Auto-refresh every 5 seconds when enabled
   */
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchSummary();
      fetchActiveAttempts();
      if (selectedAttempt) {
        fetchAttemptDetails(selectedAttempt.id);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRefresh, selectedAttempt]);

  /**
   * Get status badge class
   */
  const getStatusClass = (status: string): string => {
    const classMap: Record<string, string> = {
      pending: 'status-pending',
      running: 'status-running',
      investigating: 'status-investigating',
      fixing: 'status-fixing',
      testing: 'status-testing',
      success: 'status-success',
      failed: 'status-failed'
    };
    return classMap[status] || 'status-unknown';
  };

  /**
   * Format duration
   */
  const formatDuration = (ms?: number): string => {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  /**
   * Format timestamp
   */
  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <div className="auto-fix-monitor loading">
        <div className="spinner">Loading auto-fix monitor...</div>
      </div>
    );
  }

  return (
    <div className="auto-fix-monitor">
      {/* Header */}
      <div className="monitor-header">
        <h2>Auto-Fix Monitor</h2>
        <div className="header-controls">
          <label className="auto-refresh-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (5s)
          </label>
          <button onClick={refreshData} className="btn-refresh">
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="summary-cards">
          <div className="summary-card">
            <div className="card-icon">📊</div>
            <div className="card-content">
              <div className="card-value">{summary.totalAttempts}</div>
              <div className="card-label">Total Attempts</div>
            </div>
          </div>

          <div className="summary-card active">
            <div className="card-icon">⚡</div>
            <div className="card-content">
              <div className="card-value">{summary.activeAttempts}</div>
              <div className="card-label">Active</div>
            </div>
          </div>

          <div className="summary-card success">
            <div className="card-icon">✅</div>
            <div className="card-content">
              <div className="card-value">{summary.successfulAttempts}</div>
              <div className="card-label">Successful</div>
            </div>
          </div>

          <div className="summary-card failed">
            <div className="card-icon">❌</div>
            <div className="card-content">
              <div className="card-value">{summary.failedAttempts}</div>
              <div className="card-label">Failed</div>
            </div>
          </div>
        </div>
      )}

      {/* Active Attempts */}
      {activeAttempts.length > 0 && (
        <div className="active-attempts-section">
          <h3>🔥 Active Auto-Fixes</h3>
          <div className="attempts-list">
            {activeAttempts.map((attempt) => (
              <div
                key={attempt.id}
                className="attempt-card active-attempt"
                onClick={() => fetchAttemptDetails(attempt.id)}
              >
                <div className="attempt-header">
                  <span className="attempt-id">Workflow #{attempt.workflowId}</span>
                  <span className={`status-badge ${getStatusClass(attempt.status)}`}>
                    {attempt.status}
                  </span>
                </div>

                {attempt.progress && (
                  <div className="progress-section">
                    <div className="progress-stage">{attempt.progress.stage}</div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${attempt.progress.percentage}%` }}
                      />
                    </div>
                    <div className="progress-message">{attempt.progress.message}</div>
                    <div className="progress-percentage">{attempt.progress.percentage}%</div>
                  </div>
                )}

                <div className="attempt-meta">
                  <span>⏱️ Started: {formatTimestamp(attempt.startedAt)}</span>
                  {attempt.pid && <span>🔧 PID: {attempt.pid}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      <div className="history-section">
        <h3>📜 Recent History</h3>
        <div className="history-table">
          <table>
            <thead>
              <tr>
                <th>Workflow</th>
                <th>Status</th>
                <th>Started</th>
                <th>Duration</th>
                <th>Result</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.map((attempt) => (
                <tr key={attempt.id}>
                  <td>#{attempt.workflowId}</td>
                  <td>
                    <span className={`status-badge ${getStatusClass(attempt.status)}`}>
                      {attempt.status}
                    </span>
                  </td>
                  <td>{formatTimestamp(attempt.startedAt)}</td>
                  <td>{formatDuration(attempt.duration)}</td>
                  <td>
                    {attempt.status === 'success' && attempt.newWorkflowId && (
                      <span className="result-success">
                        ✅ Workflow #{attempt.newWorkflowId}
                      </span>
                    )}
                    {attempt.status === 'failed' && (
                      <span className="result-failed">❌ {attempt.error}</span>
                    )}
                    {attempt.status === 'running' && (
                      <span className="result-running">⏳ In progress...</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn-details"
                      onClick={() => fetchAttemptDetails(attempt.id)}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Panel */}
      {selectedAttempt && (
        <div className="details-panel">
          <div className="panel-overlay" onClick={() => setSelectedAttempt(null)} />
          <div className="panel-content">
            <div className="panel-header">
              <h3>Auto-Fix Details - Workflow #{selectedAttempt.workflowId}</h3>
              <button className="btn-close" onClick={() => setSelectedAttempt(null)}>
                ✕
              </button>
            </div>

            <div className="panel-body">
              <div className="detail-section">
                <h4>Status</h4>
                <span className={`status-badge large ${getStatusClass(selectedAttempt.status)}`}>
                  {selectedAttempt.status}
                </span>
              </div>

              <div className="detail-section">
                <h4>Timeline</h4>
                <ul className="detail-list">
                  <li>Started: {formatTimestamp(selectedAttempt.startedAt)}</li>
                  {selectedAttempt.completedAt && (
                    <li>Completed: {formatTimestamp(selectedAttempt.completedAt)}</li>
                  )}
                  <li>Duration: {formatDuration(selectedAttempt.duration)}</li>
                  {selectedAttempt.pid && <li>Process ID: {selectedAttempt.pid}</li>}
                </ul>
              </div>

              {selectedAttempt.rootCause && (
                <div className="detail-section">
                  <h4>Root Cause</h4>
                  <p className="detail-text">{selectedAttempt.rootCause}</p>
                </div>
              )}

              {selectedAttempt.fixDescription && (
                <div className="detail-section">
                  <h4>Fix Applied</h4>
                  <p className="detail-text">{selectedAttempt.fixDescription}</p>
                </div>
              )}

              {selectedAttempt.commitHash && (
                <div className="detail-section">
                  <h4>Commit</h4>
                  <code className="detail-code">{selectedAttempt.commitHash}</code>
                </div>
              )}

              {selectedAttempt.newWorkflowId && (
                <div className="detail-section">
                  <h4>New Workflow Created</h4>
                  <a
                    href={`/workflows/${selectedAttempt.newWorkflowId}`}
                    className="link-workflow"
                  >
                    View Workflow #{selectedAttempt.newWorkflowId} →
                  </a>
                </div>
              )}

              {selectedAttempt.error && (
                <div className="detail-section error">
                  <h4>Error</h4>
                  <pre className="error-text">{selectedAttempt.error}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutoFixMonitor;
