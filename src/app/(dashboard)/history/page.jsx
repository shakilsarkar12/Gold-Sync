'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/Toast';
import { History, CheckCircle, XCircle } from 'lucide-react';

export default function HistoryPage() {
  const { showToast } = useToast();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadLogs() {
      try {
        const res = await fetch('/api/logs');
        if (!res.ok) throw new Error('Failed to fetch logs');
        const data = await res.json();
        setLogs(data);
      } catch (error) {
        showToast(error.message || 'Error loading sync history', 'error');
      } finally {
        setLoading(false);
      }
    }
    loadLogs();
  }, [showToast]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <div className="luxury-text gold-text-gradient loading-dots" style={{ fontSize: '1.5rem' }}>
          Loading Sync History
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
      <header className="page-header">
        <div>
          <h1 className="page-title luxury-text">Sync History</h1>
          <p className="page-subtitle">Audit logs and details of past price synchronization operations</p>
        </div>
      </header>

      {logs.length > 0 ? (
        <div className="table-container glass-card" style={{ padding: 0 }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th style={{ width: '180px' }}>Timestamp</th>
                <th style={{ width: '150px' }}>Sync Type</th>
                <th>Details</th>
                <th>Products Updated</th>
                <th style={{ width: '120px', textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <div style={{ fontSize: '0.85rem' }}>
                      {new Date(log.timestamp).toLocaleDateString()}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </div>
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        backgroundColor: log.type === 'bulk' ? 'rgba(212, 175, 55, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                        color: log.type === 'bulk' ? 'var(--gold-primary)' : 'var(--text-primary)',
                        border: log.type === 'bulk' ? '1px solid rgba(212, 175, 55, 0.2)' : '1px solid rgba(255, 255, 255, 0.08)',
                      }}
                    >
                      {log.type === 'bulk' ? 'Bulk Sync' : 'Single Sync'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.9rem', lineHeight: '1.4' }}>
                    {log.details}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{log.productsUpdated}</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      {log.status === 'success' ? (
                        <span className="badge badge-success" style={{ gap: '0.25rem' }}>
                          <CheckCircle size={10} />
                          Success
                        </span>
                      ) : (
                        <span className="badge badge-danger" style={{ gap: '0.25rem' }}>
                          <XCircle size={10} />
                          Failed
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <History size={36} color="var(--text-muted)" style={{ margin: '0 auto 1rem' }} />
          <h3>No Sync Actions Logged</h3>
          <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
            When you run price updates, details of the changes will be logged here for auditing.
          </p>
        </div>
      )}
    </div>
  );
}
