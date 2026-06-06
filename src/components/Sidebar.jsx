'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Gem, History, Settings, Coins } from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/products', label: 'Products', icon: Gem },
    { href: '/history', label: 'Sync History', icon: History },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

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
      </nav>
      <div style={{ marginTop: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
        <span>Shopify Integration v1.0</span>
      </div>
    </aside>
  );
}
