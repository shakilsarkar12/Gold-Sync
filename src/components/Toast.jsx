'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';

const ToastContext = createContext(undefined);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="toast"
            style={{
              borderLeftColor:
                toast.type === 'success'
                  ? 'var(--success)'
                  : toast.type === 'error'
                  ? 'var(--danger)'
                  : 'var(--gold-primary)',
            }}
          >
            {toast.type === 'success' && <CheckCircle size={18} color="var(--success)" />}
            {toast.type === 'error' && <XCircle size={18} color="var(--danger)" />}
            {toast.type === 'info' && <AlertCircle size={18} color="var(--gold-primary)" />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
