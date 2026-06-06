'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/Toast';
import { Save, Calculator } from 'lucide-react';

export default function SettingsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const readOnly = false; // Settings are editable at runtime
  
  const [settings, setSettings] = useState({
    shopifyShop: '',
    shopifyAccessToken: '',
    goldApiKey: '',
    currency: 'USD',
    defaultKarat: '18K',
    weightNamespace: 'custom',
    weightKey: 'gold_weight',
    karatNamespace: 'custom',
    karatKey: 'gold_karat',
    diamondNamespace: 'custom',
    diamondKey: 'diamond_price',
    gstPercentage: 3,
    makingChargePerGram: 0,
    makingChargeFixed: 0,
    fixedMarkup: 0,
    markupPercentage: 0,
    autoSyncEnabled: false,
    syncInterval: 5,
  });

  // Simulator State
  const [simWeight, setSimWeight] = useState('10');
  const [simKarat, setSimKarat] = useState('18K');
  const [simDiamondPrice, setSimDiamondPrice] = useState('150');
  const [simGoldPrice, setSimGoldPrice] = useState('75.50');

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) throw new Error('Failed to load settings');
        const data = await res.json();
        setSettings(data);
      } catch (error) {
        showToast(error.message || 'Error loading configurations', 'error');
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, [showToast]);

  // Compute simulator results synchronously during render (no useEffect needed)
  const weight = parseFloat(simWeight) || 0;
  const goldPriceGram = parseFloat(simGoldPrice) || 0;
  const diamondPrice = parseFloat(simDiamondPrice) || 0;
  
  const simKaratNum = parseInt(simKarat.replace(/[^0-9]/g, '')) || 18;
  const baseGoldPriceForKarat = goldPriceGram * (simKaratNum / 24);
  
  const makingChargePerGram = parseFloat(settings.makingChargePerGram) || 0;
  const makingChargeFixed = parseFloat(settings.makingChargeFixed) || 0;
  const markupPercentage = parseFloat(settings.markupPercentage) || 0;
  const fixedMarkup = parseFloat(settings.fixedMarkup) || 0;
  const gstPercentage = parseFloat(settings.gstPercentage) || 0;

  const baseGoldCost = weight * baseGoldPriceForKarat;
  const makingCharges = (weight * makingChargePerGram) + makingChargeFixed;
  const subtotal = baseGoldCost + diamondPrice + makingCharges;
  const markupMultiplier = 1 + (markupPercentage / 100);
  
  const priceBeforeTax = (subtotal * markupMultiplier) + fixedMarkup;
  const gstAmount = priceBeforeTax * (gstPercentage / 100);
  const finalPrice = priceBeforeTax + gstAmount;

  const simResult = {
    goldPriceForKarat: baseGoldPriceForKarat.toFixed(2),
    baseGoldCost: baseGoldCost.toFixed(2),
    diamondPrice: diamondPrice.toFixed(2),
    makingCharges: makingCharges.toFixed(2),
    subtotal: subtotal.toFixed(2),
    markupAmount: (subtotal * (markupMultiplier - 1)).toFixed(2),
    priceBeforeTax: priceBeforeTax.toFixed(2),
    gstAmount: gstAmount.toFixed(2),
    finalPrice: finalPrice.toFixed(2),
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save settings');
      }

      showToast('Settings saved successfully', 'success');

      // Trigger an immediate sync after settings change so prices update right away
      fetch('/api/sync-now', { method: 'POST' }).catch(() => {});
    } catch (error) {
      showToast(error.message || 'Error updating settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <div className="luxury-text gold-text-gradient loading-dots" style={{ fontSize: '1.5rem' }}>
          Loading Settings
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
      <header className="page-header">
        <div>
          <h1 className="page-title luxury-text">Configurations</h1>
          <p className="page-subtitle">Configure credentials, metafield maps, and your gold pricing formulas</p>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="grid-2">
        <fieldset disabled={readOnly} style={{ border: 'none', padding: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="glass-card">
            <h2 className="card-title luxury-text">
              <span>Shopify Credentials</span>
            </h2>
            
            <div className="form-group">
              <label className="form-label" htmlFor="shopifyShop">
                Shopify Domain
              </label>
              <input
                id="shopifyShop"
                type="text"
                name="shopifyShop"
                className="form-input"
                placeholder="your-store.myshopify.com"
                value={settings.shopifyShop}
                onChange={handleChange}
                disabled={true}
                required
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Managed securely in .env configuration</p>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="shopifyAccessToken">
                Admin API Access Token
              </label>
              <input
                id="shopifyAccessToken"
                type="password"
                name="shopifyAccessToken"
                className="form-input"
                placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxx"
                value={settings.shopifyAccessToken}
                onChange={handleChange}
                disabled={true}
                required
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Managed securely in .env configuration</p>
            </div>
          </div>

          <div className="glass-card">
            <h2 className="card-title luxury-text">
              <span>GoldAPI.io Settings</span>
            </h2>

            <div className="form-group">
              <label className="form-label" htmlFor="goldApiKey">
                GoldAPI.io Key
              </label>
              <input
                id="goldApiKey"
                type="password"
                name="goldApiKey"
                className="form-input"
                placeholder="goldapi-xxxxxx-xxxxxx"
                value={settings.goldApiKey}
                onChange={handleChange}
                disabled={true}
                required
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Managed securely in .env configuration</p>
            </div>

            <div className="grid-2" style={{ marginBottom: 0, gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="currency">
                  Pricing Currency
                </label>
                <select
                  id="currency"
                  name="currency"
                  className="form-input form-select"
                  value={settings.currency}
                  onChange={handleChange}
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="CAD">CAD (C$)</option>
                  <option value="INR">INR (₹)</option>
                  <option value="AED">AED (Dh)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="defaultKarat">
                  Default Karat
                </label>
                <select
                  id="defaultKarat"
                  name="defaultKarat"
                  className="form-input form-select"
                  value={settings.defaultKarat}
                  onChange={handleChange}
                >
                  <option value="24K">24K (Pure Gold)</option>
                  <option value="22K">22K</option>
                  <option value="21K">21K</option>
                  <option value="18K">18K</option>
                  <option value="14K">14K</option>
                  <option value="10K">10K</option>
                </select>
              </div>
            </div>
          </div>

          <div className="glass-card" style={{ borderLeft: '4px solid var(--gold-primary)' }}>
            <h2 className="card-title luxury-text">
              <span>Automatic Price Sync</span>
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Automatically run gold price sync on the server at regular intervals.
            </p>

            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <input
                id="autoSyncEnabled"
                type="checkbox"
                name="autoSyncEnabled"
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--gold-primary)' }}
                checked={settings.autoSyncEnabled}
                onChange={handleChange}
              />
              <label className="form-label" htmlFor="autoSyncEnabled" style={{ marginBottom: 0, cursor: 'pointer' }}>
                Enable Automatic Sync
              </label>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="syncInterval">
                Sync Interval (Minutes)
              </label>
              <select
                id="syncInterval"
                name="syncInterval"
                className="form-input form-select"
                value={settings.syncInterval}
                onChange={handleChange}
                disabled={!settings.autoSyncEnabled}
              >
                <option value="1">1 Minute (Testing)</option>
                <option value="5">5 Minutes</option>
                <option value="10">10 Minutes</option>
                <option value="15">15 Minutes</option>
                <option value="30">30 Minutes</option>
                <option value="60">1 Hour (60 Minutes)</option>
              </select>
            </div>
          </div>

          <div className="glass-card">
            <h2 className="card-title luxury-text">
              <span>Metafield Mapping (Variant Level)</span>
            </h2>
            
            <div className="grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Gold Weight Namespace</label>
                <input
                  type="text"
                  name="weightNamespace"
                  className="form-input"
                  value={settings.weightNamespace}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Gold Weight Key</label>
                <input
                  type="text"
                  name="weightKey"
                  className="form-input"
                  value={settings.weightKey}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Gold Karat Namespace</label>
                <input
                  type="text"
                  name="karatNamespace"
                  className="form-input"
                  value={settings.karatNamespace}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Gold Karat Key</label>
                <input
                  type="text"
                  name="karatKey"
                  className="form-input"
                  value={settings.karatKey}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="grid-2" style={{ gap: '1rem', marginBottom: 0 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Diamond Price Namespace</label>
                <input
                  type="text"
                  name="diamondNamespace"
                  className="form-input"
                  value={settings.diamondNamespace}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Diamond Price Key</label>
                <input
                  type="text"
                  name="diamondKey"
                  className="form-input"
                  value={settings.diamondKey}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>
          </div>
        </div>
        </fieldset>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="glass-card">
            <h2 className="card-title luxury-text">
              <span>Gold Pricing Formula & Tax</span>
            </h2>

            <div className="grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Profit Markup (%)</label>
                <input
                  type="number"
                  name="markupPercentage"
                  className="form-input"
                  min="0"
                  step="0.1"
                  value={settings.markupPercentage}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">GST Tax Percentage (%)</label>
                <input
                  type="number"
                  name="gstPercentage"
                  className="form-input"
                  min="0"
                  step="0.1"
                  value={settings.gstPercentage}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Making Charge / Gram</label>
                <input
                  type="number"
                  name="makingChargePerGram"
                  className="form-input"
                  min="0"
                  step="0.01"
                  value={settings.makingChargePerGram}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Fixed Making Charge</label>
                <input
                  type="number"
                  name="makingChargeFixed"
                  className="form-input"
                  min="0"
                  step="0.01"
                  value={settings.makingChargeFixed}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Fixed Markup ($)</label>
              <input
                type="number"
                name="fixedMarkup"
                className="form-input"
                min="0"
                step="0.01"
                value={settings.fixedMarkup}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="glass-card" style={{ borderColor: 'rgba(212, 175, 55, 0.45)', boxShadow: 'var(--gold-glow)' }}>
            <h2 className="card-title luxury-text" style={{ color: 'var(--gold-primary)' }}>
              <Calculator size={18} />
              <span>Formula Simulator</span>
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Test your configuration with GST tax.
            </p>

            <div className="grid-2" style={{ gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Gold Rate / Gram (24K)</label>
                <input
                  type="number"
                  className="form-input"
                  value={simGoldPrice}
                  onChange={(e) => setSimGoldPrice(e.target.value)}
                  step="0.01"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Gold Weight (Grams)</label>
                <input
                  type="number"
                  className="form-input"
                  value={simWeight}
                  onChange={(e) => setSimWeight(e.target.value)}
                  step="0.01"
                />
              </div>
            </div>

            <div className="grid-2" style={{ gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Diamond Cost ($)</label>
                <input
                  type="number"
                  className="form-input"
                  value={simDiamondPrice}
                  onChange={(e) => setSimDiamondPrice(e.target.value)}
                  step="0.01"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Karat</label>
                <select
                  className="form-input form-select"
                  value={simKarat}
                  onChange={(e) => setSimKarat(e.target.value)}
                >
                  <option value="24K">24K</option>
                  <option value="22K">22K</option>
                  <option value="21K">21K</option>
                  <option value="18K">18K</option>
                  <option value="14K">14K</option>
                  <option value="10K">10K</option>
                </select>
              </div>
            </div>

            {simResult && (
              <div style={{ background: 'rgba(0, 0, 0, 0.4)', borderRadius: '8px', padding: '1rem', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Gold Price per Gram ({simKarat}):</span>
                  <span>{settings.currency} {simResult.goldPriceForKarat}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Base Gold Cost ({simWeight}g):</span>
                  <span>{settings.currency} {simResult.baseGoldCost}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Diamond Cost:</span>
                  <span>{settings.currency} {simResult.diamondPrice}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Making Charges:</span>
                  <span>{settings.currency} {simResult.makingCharges}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Subtotal:</span>
                  <span>{settings.currency} {simResult.subtotal}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Profit Markup ({settings.markupPercentage}%):</span>
                  <span>{settings.currency} {simResult.markupAmount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Price Before Tax:</span>
                  <span>{settings.currency} {simResult.priceBeforeTax}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>GST Tax ({settings.gstPercentage}%):</span>
                  <span>{settings.currency} {simResult.gstAmount}</span>
                </div>
                <hr style={{ borderColor: 'var(--border-color)', margin: '0.6rem 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="luxury-text" style={{ fontSize: '0.9rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>Simulated Price (Inc. Tax):</span>
                  <span className="gold-text-gradient" style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>
                    {settings.currency} {simResult.finalPrice}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Save size={16} className={saving ? 'animate-spin' : ''} />
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
