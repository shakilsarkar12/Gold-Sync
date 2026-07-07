'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import {
  TrendingUp,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Gem,
  Coins,
  Settings as SettingsIcon,
  ArrowRight
} from 'lucide-react';

export default function Dashboard() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);

  const loadDashboardData = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true);
    try {
      const res = await fetch(`/api/products${forceRefresh ? '?refresh=true' : ''}`);
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to load dashboard data');
      }

      const payload = await res.json();
      setData(payload);
    } catch (error) {
      showToast(error.message || 'Error loading dashboard data', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    loadDashboardData();
  }, [loadDashboardData]);

  const handleRefreshRates = () => {
    loadDashboardData(true);
    showToast('Rates refreshed successfully', 'success');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <div className="luxury-text gold-text-gradient loading-dots" style={{ fontSize: '1.5rem' }}>
          Loading Dashboard
        </div>
      </div>
    );
  }

  const products = data?.products || [];
  const goldProducts = products.filter(p => p.isGoldProduct);
  const outOfSyncProducts = goldProducts.filter(p => p.outOfSync);
  const upToDateProductsCount = goldProducts.length - outOfSyncProducts.length;

  const rates = data?.goldRates || {};
  const isShopifyConfigured = !data?.warning;

  return (
    <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
      <header className="page-header">
        <div>
          <h1 className="page-title luxury-text">Dashboard</h1>
          <p className="page-subtitle">Real-time gold price monitoring and Shopify catalog status</p>
        </div>
        <button
          onClick={handleRefreshRates}
          className="btn btn-secondary btn-small"
          disabled={refreshing || !rates.price}
        >
          <RefreshCw className={refreshing ? 'animate-spin' : ''} size={14} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh Rates'}</span>
        </button>
      </header>

      {!isShopifyConfigured && (
        <div className="glass-card" style={{ borderLeft: '4px solid var(--warning)', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <AlertTriangle size={20} color="var(--warning)" />
            <div>
              <p style={{ fontWeight: 600 }}>Shopify Integration Pending</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Please go to the <Link href="/settings" style={{ color: 'var(--gold-primary)', textDecoration: 'underline' }}>Settings Page</Link> to configure your Shopify credentials and GoldAPI.io key.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid-3">
        <div className="glass-card">
          <div className="card-title">
            <Coins size={18} color="var(--gold-primary)" />
            <span>Gold Spot Rate (oz)</span>
          </div>
          <div className="metric-value">
            {rates.price ? `${rates.currency || 'USD'} ${Number(rates.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A'}
          </div>
          <div className="metric-footer">
            {rates.timestamp ? `Updated: ${new Date(rates.timestamp * 1000).toLocaleTimeString()}` : 'No rate fetched'}
          </div>
        </div>

        <div className="glass-card">
          <div className="card-title">
            <Gem size={18} color="var(--gold-primary)" />
            <span>Monitored Gold Items</span>
          </div>
          <div className="metric-value">
            {isShopifyConfigured ? goldProducts.length : 'N/A'}
          </div>
          <div className="metric-footer">
            {isShopifyConfigured ? `Out of ${products.length} total Shopify products` : 'Configure Shopify connection'}
          </div>
        </div>

        <div className="glass-card">
          <div className="card-title">
            {outOfSyncProducts.length > 0 ? (
              <AlertTriangle size={18} color="var(--warning)" />
            ) : (
              <CheckCircle size={18} color="var(--success)" />
            )}
            <span>Catalog Sync Status</span>
          </div>
          <div className="metric-value" style={{ color: outOfSyncProducts.length > 0 ? 'var(--warning)' : 'var(--success)' }}>
            {isShopifyConfigured ? (
              outOfSyncProducts.length > 0 ? `${outOfSyncProducts.length} Pending` : 'All Synced'
            ) : 'N/A'}
          </div>
          <div className="metric-footer">
            {isShopifyConfigured ? (
              outOfSyncProducts.length > 0
                ? `${upToDateProductsCount} products currently up-to-date`
                : 'All variant prices match live rates'
            ) : 'Settings configuration required'}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="glass-card">
          <h2 className="card-title luxury-text" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
            <TrendingUp size={18} color="var(--gold-primary)" />
            <span>Live Gold Price Per Gram</span>
          </h2>
          
          {rates.price ? (
            <div className="rate-widget-grid" style={{ marginTop: '1rem' }}>
              <div className="rate-item">
                <div className="rate-karat">24K (Pure)</div>
                <div className="rate-value">{rates.currency} {Number(rates.price_gram_24k).toFixed(2)}</div>
              </div>
              <div className="rate-item">
                <div className="rate-karat">22K</div>
                <div className="rate-value">{rates.currency} {Number(rates.price_gram_22k).toFixed(2)}</div>
              </div>
              <div className="rate-item">
                <div className="rate-karat">21K</div>
                <div className="rate-value">{rates.currency} {Number(rates.price_gram_21k).toFixed(2)}</div>
              </div>
              <div className="rate-item">
                <div className="rate-karat">18K</div>
                <div className="rate-value">{rates.currency} {Number(rates.price_gram_18k).toFixed(2)}</div>
              </div>
              <div className="rate-item">
                <div className="rate-karat">14K</div>
                <div className="rate-value">{rates.currency} {Number(rates.price_gram_14k).toFixed(2)}</div>
              </div>
              <div className="rate-item">
                <div className="rate-karat">10K</div>
                <div className="rate-value">{rates.currency} {Number(rates.price_gram_10k).toFixed(2)}</div>
              </div>
            </div>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading live rates from IBJA...
            </div>
          )}
        </div>

        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifycontent: 'space-between' }}>
          <div>
            <h2 className="card-title luxury-text" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <span>Catalog Overview</span>
            </h2>
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Total Products on Shopify:</span>
                <span style={{ fontWeight: 600 }}>{products.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Gold Jewelry Items:</span>
                <span style={{ fontWeight: 600 }}>{goldProducts.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Items Requiring Price Updates:</span>
                <span style={{ fontWeight: 600, color: outOfSyncProducts.length > 0 ? 'var(--warning)' : 'inherit' }}>
                  {outOfSyncProducts.length}
                </span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
            <Link href="/products" className="btn btn-primary" style={{ flexGrow: 1 }}>
              <span>Manage Products</span>
              <ArrowRight size={16} />
            </Link>
            <Link href="/settings" className="btn btn-secondary">
              <SettingsIcon size={16} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
