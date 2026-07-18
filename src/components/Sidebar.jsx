'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Gem, History, Settings, Coins, LogOut, Database } from 'lucide-react';
import { useToast } from '@/components/Toast';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { showToast } = useToast();

  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/products', label: 'Products', icon: Gem },
    { href: '/history', label: 'Sync History', icon: History },
    { href: '/metafields', label: 'Metafields', icon: Database },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (response.ok) {
        showToast('Logged out successfully', 'success');
        router.push('/login');
        router.refresh();
      }
    } catch (err) {
      showToast('Error logging out', 'error');
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <Coins className="text-gold animate-pulse" size={24} color="#d4af37" />
        <span className="gold-text-gradient font-semibold">GoldPrice Sync</span>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', marginTop: '1rem', color: '#ef4444' }}>
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </nav>
      <div style={{ marginTop: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
        <span>Shopify Integration v1.0</span>
      </div>
    </aside>
  );
}
