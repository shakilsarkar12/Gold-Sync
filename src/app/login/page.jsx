'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, Coins } from 'lucide-react';
import { useToast } from '@/components/Toast';
import './login.css';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { showToast } = useToast();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        showToast('Logged in successfully', 'success');
        // Redirect to dashboard
        router.push('/');
        router.refresh(); // Force refresh to update layouts/middleware state
      } else {
        showToast(data.error || 'Login failed', 'error');
      }
    } catch (err) {
      showToast('An error occurred during login', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="glass-card login-card-wrapper">
        
        <div className="flex-center">
          <Coins className="text-gold animate-pulse" size={56} color="#d4af37" />
        </div>
        
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h2 className="luxury-text gold-text-gradient" style={{ fontSize: '2.2rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Admin Access
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Login to manage Gold Price Sync
          </p>
        </div>
        
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <div className="search-input-wrapper" style={{ maxWidth: '100%' }}>
              <User className="search-icon" size={18} />
              <input
                type="text"
                className="form-input"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                style={{ paddingLeft: '2.75rem' }}
              />
            </div>
          </div>
          
          <div className="form-group" style={{ marginBottom: '2.5rem' }}>
            <label className="form-label">Password</label>
            <div className="search-input-wrapper" style={{ maxWidth: '100%' }}>
              <Lock className="search-icon" size={18} />
              <input
                type="password"
                className="form-input"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ paddingLeft: '2.75rem' }}
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={loading}
            style={{ width: '100%', fontSize: '1.1rem', padding: '1rem', display: 'flex', justifyContent: 'center' }}
          >
            {loading ? (
              <span className="loading-dots">Authenticating</span>
            ) : (
              'Secure Login'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
