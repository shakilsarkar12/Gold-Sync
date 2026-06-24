'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/Toast';
import { Save, Calculator } from 'lucide-react';

export default function SettingsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const readOnly = false; // Settings are editable at runtime
  // Snapshot of last saved settings from DB, used to detect changes
  const [savedSettings, setSavedSettings] = useState(null);
  
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
    variantWeightNamespace: 'custom',
    variantWeightKey: 'gold_weight',
    variantKaratNamespace: 'custom',
    variantKaratKey: 'gold_karat',
    diamondShapeNamespace: 'custom',
    diamondShapeKey: 'diamond_shape',
    diamondCrtNamespace: 'custom',
    diamondCrtKey: 'diamond_crt',
    diamondColorNamespace: 'custom',
    diamondColorKey: 'diamond_color',
    gstPercentage: 3,
    makingChargePerGram: 0,
    makingChargeFixed: 0,
    fixedMarkup: 0,
    markupPercentage: 0,
    autoSyncEnabled: false,
    syncInterval: 5,
    timezone: 'Asia/Dhaka',
    syncTimes: ['18:00'],
    goldRateMetafield1Enabled: false,
    goldRateMetafield1Namespace: 'custom',
    goldRateMetafield1Key: 'gold_rate_24k',
    goldRateMetafield1Source: 'price_gram_24k',
    goldRateMetafield2Enabled: false,
    goldRateMetafield2Namespace: 'custom',
    goldRateMetafield2Key: 'gold_rate_18k',
    goldRateMetafield2Source: 'price_gram_18k',
    // Price Breakdown Metafields
    priceBreakdownEnabled: false,
    smallDiamondGradeNamespace: 'custom',
    smallDiamondGradeKey: 'small_diamonds_grade',
    smallDiamondWeightNamespace: 'custom',
    smallDiamondWeightKey: 'small_diamonds_weight',
    smallDiamondPricePerCarat: 0,
    bdGoldRatePerGramNamespace: 'custom',
    bdGoldRatePerGramKey: 'gold_rate_per_gram',
    bdTotalGoldValueNamespace: 'custom',
    bdTotalGoldValueKey: 'total_gold_value',
    bdCentreStoneValueNamespace: 'custom',
    bdCentreStoneValueKey: 'centre_stone_value',
    bdSmallDiamondValueNamespace: 'custom',
    bdSmallDiamondValueKey: 'small_diamonds_value',
    bdMakingChargeRateNamespace: 'custom',
    bdMakingChargeRateKey: 'making_charge_per_gram',
    bdTotalMakingNamespace: 'custom',
    bdTotalMakingKey: 'total_making_charge',
    diamondPrices: {
      round: { d: 34999, ef: 31999, gh: 29999 },
      princess: { d: 34999, ef: 31999, gh: 29999 },
      cushion: { d: 34999, ef: 31999, gh: 29999 },
      oval: { d: 34999, ef: 31999, gh: 29999 },
      emerald: { d: 34999, ef: 31999, gh: 29999 },
      portuguese: { d: 39999, ef: 36999, gh: 31999 },
      pear: { d: 34999, ef: 31999, gh: 29999 },
      asscher: { d: 34999, ef: 31999, gh: 29999 },
      heart: { d: 34999, ef: 31999, gh: 29999 },
      radiant: { d: 34999, ef: 31999, gh: 29999 },
      marquise: { d: 34999, ef: 31999, gh: 29999 },
      baguette: { d: 34999, ef: 31999, gh: 29999 }
    }
  });

  // Simulator State
  const [simWeight, setSimWeight] = useState('10');
  const [simKarat, setSimKarat] = useState('18K');
  const [simDiamondPrice, setSimDiamondPrice] = useState('150');
  const [simGoldPrice, setSimGoldPrice] = useState('75.50');
  const [simDiamondShape, setSimDiamondShape] = useState('round');
  const [simDiamondCrt, setSimDiamondCrt] = useState('3.5');
  const [simDiamondColor, setSimDiamondColor] = useState('d');
  const [simUseMatrix, setSimUseMatrix] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) throw new Error('Failed to load settings');
        const data = await res.json();
        
        // Ensure arrays and objects exist
        const mergedData = {
          ...data,
          syncTimes: data.syncTimes || ['18:00'],
          diamondPrices: {
            round: { d: 34999, ef: 31999, gh: 29999 },
            princess: { d: 34999, ef: 31999, gh: 29999 },
            cushion: { d: 34999, ef: 31999, gh: 29999 },
            oval: { d: 34999, ef: 31999, gh: 29999 },
            emerald: { d: 34999, ef: 31999, gh: 29999 },
            portuguese: { d: 39999, ef: 36999, gh: 31999 },
            pear: { d: 34999, ef: 31999, gh: 29999 },
            asscher: { d: 34999, ef: 31999, gh: 29999 },
            heart: { d: 34999, ef: 31999, gh: 29999 },
            radiant: { d: 34999, ef: 31999, gh: 29999 },
            marquise: { d: 34999, ef: 31999, gh: 29999 },
            baguette: { d: 34999, ef: 31999, gh: 29999 },
            ...(data.diamondPrices || {})
          }
        };
        setSettings(mergedData);
        setSavedSettings(mergedData);
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
  
  let diamondPrice = parseFloat(simDiamondPrice) || 0;
  if (simUseMatrix && simDiamondShape && simDiamondCrt && parseFloat(simDiamondCrt) > 0) {
    const shapePrices = settings.diamondPrices?.[simDiamondShape] || {};
    const pricePerCrt = parseFloat(shapePrices[simDiamondColor]) || 0;
    diamondPrice = parseFloat(simDiamondCrt) * pricePerCrt;
  }
  
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

  const handleSyncTimeChange = (index, value) => {
    setSettings((prev) => {
      const times = [...(prev.syncTimes || [])];
      times[index] = value;
      return {
        ...prev,
        syncTimes: times,
      };
    });
  };

  const handleFrequencyChange = (e) => {
    const freq = parseInt(e.target.value, 10);
    setSettings((prev) => {
      const times = [...(prev.syncTimes || [])];
      if (times.length < freq) {
        while (times.length < freq) {
          times.push('12:00');
        }
      } else if (times.length > freq) {
        times.splice(freq);
      }
      return {
        ...prev,
        syncTimes: times,
      };
    });
  };

  const handleDiamondPriceChange = (shape, colorKey, value) => {
    const val = parseFloat(value) || 0;
    setSettings((prev) => {
      const prices = { ...prev.diamondPrices };
      prices[shape] = {
        ...prices[shape],
        [colorKey]: val,
      };
      return {
        ...prev,
        diamondPrices: prices,
      };
    });
  };

  // Pricing-related keys — only trigger sync if these change
  const PRICING_KEYS = [
    'gstPercentage', 'makingChargePerGram', 'makingChargeFixed',
    'fixedMarkup', 'markupPercentage', 'diamondPrices',
  ];

  // Deep-equal check (JSON stringify is sufficient for flat/nested numbers)
  const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // True when any field differs from what was last saved to DB
  const hasChanges = savedSettings
    ? !deepEqual(settings, savedSettings)
    : false;

  // True when any pricing / diamond field has changed
  const hasPricingChanges = savedSettings
    ? PRICING_KEYS.some((key) => !deepEqual(settings[key], savedSettings[key]))
    : false;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!hasChanges) return;
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

      // Update the saved snapshot so button becomes disabled again
      setSavedSettings(settings);
      showToast('Settings saved successfully', 'success');

      // Only trigger auto-sync if pricing or diamond matrix fields changed
      if (hasPricingChanges) {
        fetch('/api/sync-now', { method: 'POST' }).catch(() => {});
      }
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
              Automatically run gold price sync on the server at daily scheduled times.
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

            {settings.autoSyncEnabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                  <label className="form-label" htmlFor="timezone">
                    Timezone
                  </label>
                  <select
                    id="timezone"
                    name="timezone"
                    className="form-input form-select"
                    value={settings.timezone || 'Asia/Dhaka'}
                    onChange={handleChange}
                  >
                    <option value="Asia/Dhaka">Asia/Dhaka (GMT+6)</option>
                    <option value="Asia/Kolkata">Asia/Kolkata (GMT+5:30)</option>
                    <option value="UTC">UTC (GMT+0)</option>
                    <option value="America/New_York">America/New_York (EST/EDT)</option>
                    <option value="Europe/London">Europe/London (GMT/BST)</option>
                    <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                  <label className="form-label">
                    Sync Frequency
                  </label>
                  <select
                    className="form-input form-select"
                    value={(settings.syncTimes || []).length}
                    onChange={handleFrequencyChange}
                  >
                    <option value="1">1 time per day</option>
                    <option value="2">2 times per day</option>
                    <option value="3">3 times per day</option>
                    <option value="4">4 times per day</option>
                    <option value="5">5 times per day</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Scheduled Times</label>
                  {(settings.syncTimes || []).map((time, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', minWidth: '60px' }}>Time {idx + 1}:</span>
                      <input
                        type="time"
                        className="form-input"
                        style={{ maxWidth: '150px' }}
                        value={time}
                        onChange={(e) => handleSyncTimeChange(idx, e.target.value)}
                        required
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Gold Rate Product Metafields ── */}
          <div className="glass-card" style={{ borderLeft: '4px solid rgba(212,175,55,0.55)' }}>
            <h2 className="card-title luxury-text">
              <span>Gold Rate Metafields (Product Level)</span>
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Write live GoldAPI values to two configurable <strong>product</strong> metafields on every sync — auto or manual. Your Shopify theme can then read these values to display the current gold rate.
            </p>

            {/* ── Metafield #1 ── */}
            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <input
                  id="goldRateMetafield1Enabled"
                  type="checkbox"
                  name="goldRateMetafield1Enabled"
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--gold-primary)' }}
                  checked={settings.goldRateMetafield1Enabled}
                  onChange={handleChange}
                />
                <label className="form-label" htmlFor="goldRateMetafield1Enabled" style={{ marginBottom: 0, cursor: 'pointer', fontWeight: 600 }}>
                  Enable Metafield #1
                </label>
              </div>

              {settings.goldRateMetafield1Enabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>GoldAPI Value to Write</label>
                    <select
                      name="goldRateMetafield1Source"
                      className="form-input form-select"
                      value={settings.goldRateMetafield1Source}
                      onChange={handleChange}
                    >
                      <option value="price">Spot Price (per troy oz)</option>
                      <option value="price_gram_24k">Price per gram — 24K</option>
                      <option value="price_gram_22k">Price per gram — 22K</option>
                      <option value="price_gram_21k">Price per gram — 21K</option>
                      <option value="price_gram_18k">Price per gram — 18K</option>
                      <option value="price_gram_14k">Price per gram — 14K</option>
                      <option value="price_gram_10k">Price per gram — 10K</option>
                    </select>
                  </div>
                  <div className="grid-2" style={{ gap: '0.75rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Namespace</label>
                      <input
                        type="text"
                        name="goldRateMetafield1Namespace"
                        className="form-input"
                        value={settings.goldRateMetafield1Namespace}
                        onChange={handleChange}
                        placeholder="custom"
                        required={settings.goldRateMetafield1Enabled}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Key</label>
                      <input
                        type="text"
                        name="goldRateMetafield1Key"
                        className="form-input"
                        value={settings.goldRateMetafield1Key}
                        onChange={handleChange}
                        placeholder="gold_rate_24k"
                        required={settings.goldRateMetafield1Enabled}
                      />
                    </div>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                    Written to every synced product as: <code style={{ background: 'rgba(255,255,255,0.08)', padding: '0 4px', borderRadius: 3 }}>{settings.goldRateMetafield1Namespace}.{settings.goldRateMetafield1Key}</code>
                  </p>
                </div>
              )}
            </div>

            {/* ── Metafield #2 ── */}
            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <input
                  id="goldRateMetafield2Enabled"
                  type="checkbox"
                  name="goldRateMetafield2Enabled"
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--gold-primary)' }}
                  checked={settings.goldRateMetafield2Enabled}
                  onChange={handleChange}
                />
                <label className="form-label" htmlFor="goldRateMetafield2Enabled" style={{ marginBottom: 0, cursor: 'pointer', fontWeight: 600 }}>
                  Enable Metafield #2
                </label>
              </div>

              {settings.goldRateMetafield2Enabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>GoldAPI Value to Write</label>
                    <select
                      name="goldRateMetafield2Source"
                      className="form-input form-select"
                      value={settings.goldRateMetafield2Source}
                      onChange={handleChange}
                    >
                      <option value="price">Spot Price (per troy oz)</option>
                      <option value="price_gram_24k">Price per gram — 24K</option>
                      <option value="price_gram_22k">Price per gram — 22K</option>
                      <option value="price_gram_21k">Price per gram — 21K</option>
                      <option value="price_gram_18k">Price per gram — 18K</option>
                      <option value="price_gram_14k">Price per gram — 14K</option>
                      <option value="price_gram_10k">Price per gram — 10K</option>
                    </select>
                  </div>
                  <div className="grid-2" style={{ gap: '0.75rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Namespace</label>
                      <input
                        type="text"
                        name="goldRateMetafield2Namespace"
                        className="form-input"
                        value={settings.goldRateMetafield2Namespace}
                        onChange={handleChange}
                        placeholder="custom"
                        required={settings.goldRateMetafield2Enabled}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Key</label>
                      <input
                        type="text"
                        name="goldRateMetafield2Key"
                        className="form-input"
                        value={settings.goldRateMetafield2Key}
                        onChange={handleChange}
                        placeholder="gold_rate_18k"
                        required={settings.goldRateMetafield2Enabled}
                      />
                    </div>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                    Written to every synced product as: <code style={{ background: 'rgba(255,255,255,0.08)', padding: '0 4px', borderRadius: 3 }}>{settings.goldRateMetafield2Namespace}.{settings.goldRateMetafield2Key}</code>
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="glass-card">
            <h2 className="card-title luxury-text">
              <span>Metafield Mapping (Variant Level)</span>
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Define namespaces and keys for Shopify Variant Metafields.
            </p>
            
            <div className="grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Gold Weight Namespace</label>
                <input
                  type="text"
                  name="variantWeightNamespace"
                  className="form-input"
                  value={settings.variantWeightNamespace}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Gold Weight Key</label>
                <input
                  type="text"
                  name="variantWeightKey"
                  className="form-input"
                  value={settings.variantWeightKey}
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
                  name="variantKaratNamespace"
                  className="form-input"
                  value={settings.variantKaratNamespace}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Gold Karat Key</label>
                <input
                  type="text"
                  name="variantKaratKey"
                  className="form-input"
                  value={settings.variantKaratKey}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Diamond Shape Namespace</label>
                <input
                  type="text"
                  name="diamondShapeNamespace"
                  className="form-input"
                  value={settings.diamondShapeNamespace}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Diamond Shape Key</label>
                <input
                  type="text"
                  name="diamondShapeKey"
                  className="form-input"
                  value={settings.diamondShapeKey}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Diamond Carats Namespace</label>
                <input
                  type="text"
                  name="diamondCrtNamespace"
                  className="form-input"
                  value={settings.diamondCrtNamespace}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Diamond Carats Key</label>
                <input
                  type="text"
                  name="diamondCrtKey"
                  className="form-input"
                  value={settings.diamondCrtKey}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="grid-2" style={{ gap: '1rem', marginBottom: 0 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Diamond Color Namespace</label>
                <input
                  type="text"
                  name="diamondColorNamespace"
                  className="form-input"
                  value={settings.diamondColorNamespace}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Diamond Color Key</label>
                <input
                  type="text"
                  name="diamondColorKey"
                  className="form-input"
                  value={settings.diamondColorKey}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>
          </div>
        </div>
        </fieldset>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* ── Price Breakdown Metafields ── */}
          <div className="glass-card" style={{ borderLeft: '4px solid rgba(100,200,150,0.55)' }}>
            <h2 className="card-title luxury-text">
              <span>Price Breakdown Metafields</span>
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Write individual pricing components to variant metafields on every sync.
              Your Shopify theme reads these to display a full price breakdown on the product page.
            </p>

            {/* Master toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <input
                id="priceBreakdownEnabled"
                type="checkbox"
                name="priceBreakdownEnabled"
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--gold-primary)' }}
                checked={settings.priceBreakdownEnabled}
                onChange={handleChange}
              />
              <label className="form-label" htmlFor="priceBreakdownEnabled" style={{ marginBottom: 0, cursor: 'pointer' }}>
                Enable Price Breakdown Sync
              </label>
            </div>

            {settings.priceBreakdownEnabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>

                {/* Small diamond config */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '1rem', border: '1px solid var(--border-color)' }}>
                  <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--gold-primary)', marginBottom: '0.75rem' }}>
                    💎 Small Diamonds (Melee) Settings
                  </p>
                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Price per Carat (Small Diamonds)</label>
                    <input
                      type="number"
                      name="smallDiamondPricePerCarat"
                      className="form-input"
                      min="0"
                      step="1"
                      value={settings.smallDiamondPricePerCarat}
                      onChange={handleChange}
                      placeholder="e.g. 15000"
                    />
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Flat price per carat for melee / small diamonds. Used to calculate <code style={{ background: 'rgba(255,255,255,0.08)', padding: '0 4px', borderRadius: 3 }}>small_diamonds_value</code>.
                    </p>
                  </div>
                  <div className="grid-2" style={{ gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Small Diamond Grade — Namespace</label>
                      <input type="text" name="smallDiamondGradeNamespace" className="form-input" value={settings.smallDiamondGradeNamespace} onChange={handleChange} placeholder="custom" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Small Diamond Grade — Key</label>
                      <input type="text" name="smallDiamondGradeKey" className="form-input" value={settings.smallDiamondGradeKey} onChange={handleChange} placeholder="small_diamonds_grade" />
                    </div>
                  </div>
                  <div className="grid-2" style={{ gap: '0.75rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Small Diamond Weight — Namespace</label>
                      <input type="text" name="smallDiamondWeightNamespace" className="form-input" value={settings.smallDiamondWeightNamespace} onChange={handleChange} placeholder="custom" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Small Diamond Weight — Key</label>
                      <input type="text" name="smallDiamondWeightKey" className="form-input" value={settings.smallDiamondWeightKey} onChange={handleChange} placeholder="small_diamonds_weight" />
                    </div>
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    ℹ️ These are <strong>input</strong> metafields — set them manually in Shopify admin. Sync reads them to compute small diamond value.
                  </p>
                </div>

                {/* Output metafield mappings table */}
                <div>
                  <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                    📤 Output Metafield Mappings (written by sync)
                  </p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ textAlign: 'left', padding: '0.4rem 0', color: 'var(--text-secondary)', fontWeight: 500 }}>Metafield</th>
                        <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Namespace</th>
                        <th style={{ textAlign: 'left', padding: '0.4rem 0', color: 'var(--text-secondary)', fontWeight: 500 }}>Key</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: '⚙ Gold Rate / Gram',      ns: 'bdGoldRatePerGramNamespace', k: 'bdGoldRatePerGramKey' },
                        { label: '⚙ Total Gold Value',       ns: 'bdTotalGoldValueNamespace',  k: 'bdTotalGoldValueKey' },
                        { label: '💎 Centre Stone Value',    ns: 'bdCentreStoneValueNamespace', k: 'bdCentreStoneValueKey' },
                        { label: '💎 Small Diamonds Value',  ns: 'bdSmallDiamondValueNamespace',k: 'bdSmallDiamondValueKey' },
                        { label: '🔨 Making Charge / Gram', ns: 'bdMakingChargeRateNamespace',  k: 'bdMakingChargeRateKey' },
                        { label: '🔨 Total Making Charge',  ns: 'bdTotalMakingNamespace',       k: 'bdTotalMakingKey' },
                      ].map(({ label, ns, k }) => (
                        <tr key={k} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '0.4rem 0', color: 'var(--text-secondary)', whiteSpace: 'nowrap', paddingRight: '0.5rem' }}>{label}</td>
                          <td style={{ padding: '0.3rem 0.5rem' }}>
                            <input
                              type="text"
                              name={ns}
                              className="form-input"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              value={settings[ns]}
                              onChange={handleChange}
                            />
                          </td>
                          <td style={{ padding: '0.3rem 0' }}>
                            <input
                              type="text"
                              name={k}
                              className="form-input"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              value={settings[k]}
                              onChange={handleChange}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

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

          <div className="glass-card" style={{ maxHeight: '420px', overflowY: 'auto' }}>
            <h2 className="card-title luxury-text">
              <span>Diamond Price Matrix (per crt)</span>
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Define lab-grown VS diamond prices per carat for shapes and color grades.
            </p>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'center' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0' }}>Shape</th>
                  <th style={{ padding: '0.5rem 0' }}>D Color</th>
                  <th style={{ padding: '0.5rem 0' }}>E-F Color</th>
                  <th style={{ padding: '0.5rem 0' }}>G-H Color</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(settings.diamondPrices || {}).map((shape) => (
                  <tr key={shape} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '0.5rem 0', fontWeight: 600, textTransform: 'capitalize' }}>{shape}</td>
                    <td style={{ padding: '0.25rem' }}>
                      <input
                        type="number"
                        className="form-input"
                        style={{ padding: '0.25rem 0.5rem', textAlign: 'center', minWidth: '70px', fontSize: '0.8rem' }}
                        value={settings.diamondPrices[shape].d}
                        onChange={(e) => handleDiamondPriceChange(shape, 'd', e.target.value)}
                        required
                        min="0"
                      />
                    </td>
                    <td style={{ padding: '0.25rem' }}>
                      <input
                        type="number"
                        className="form-input"
                        style={{ padding: '0.25rem 0.5rem', textAlign: 'center', minWidth: '70px', fontSize: '0.8rem' }}
                        value={settings.diamondPrices[shape].ef}
                        onChange={(e) => handleDiamondPriceChange(shape, 'ef', e.target.value)}
                        required
                        min="0"
                      />
                    </td>
                    <td style={{ padding: '0.25rem' }}>
                      <input
                        type="number"
                        className="form-input"
                        style={{ padding: '0.25rem 0.5rem', textAlign: 'center', minWidth: '70px', fontSize: '0.8rem' }}
                        value={settings.diamondPrices[shape].gh}
                        onChange={(e) => handleDiamondPriceChange(shape, 'gh', e.target.value)}
                        required
                        min="0"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <input
                id="simUseMatrix"
                type="checkbox"
                style={{ width: '16px', height: '16px', accentColor: 'var(--gold-primary)', cursor: 'pointer' }}
                checked={simUseMatrix}
                onChange={(e) => setSimUseMatrix(e.target.checked)}
              />
              <label htmlFor="simUseMatrix" className="form-label" style={{ marginBottom: 0, cursor: 'pointer', fontSize: '0.85rem' }}>
                Use Diamond Price Matrix
              </label>
            </div>

            {simUseMatrix ? (
              <div className="grid-3" style={{ gap: '0.5rem', marginBottom: '1.25rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Shape</label>
                  <select
                    className="form-input form-select"
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                    value={simDiamondShape}
                    onChange={(e) => setSimDiamondShape(e.target.value)}
                  >
                    <option value="round">Round</option>
                    <option value="princess">Princess</option>
                    <option value="cushion">Cushion</option>
                    <option value="oval">Oval</option>
                    <option value="emerald">Emerald</option>
                    <option value="portuguese">Portuguese</option>
                    <option value="pear">Pear</option>
                    <option value="asscher">Asscher</option>
                    <option value="heart">Heart</option>
                    <option value="radiant">Radiant</option>
                    <option value="marquise">Marquise</option>
                    <option value="baguette">Baguette</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Carats (crt)</label>
                  <input
                    type="number"
                    className="form-input"
                    style={{ padding: '0.35rem 0.5rem' }}
                    value={simDiamondCrt}
                    onChange={(e) => setSimDiamondCrt(e.target.value)}
                    step="0.01"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Color</label>
                  <select
                    className="form-input form-select"
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                    value={simDiamondColor}
                    onChange={(e) => setSimDiamondColor(e.target.value)}
                  >
                    <option value="d">D</option>
                    <option value="ef">E-F</option>
                    <option value="gh">G-H</option>
                  </select>
                </div>
              </div>
            ) : (
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
                  {/* Empty spacer to keep layout aligned */}
                </div>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
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
            <button type="submit" className="btn btn-primary" disabled={saving || !hasChanges} title={!hasChanges ? 'No changes to save' : ''}>
              <Save size={16} className={saving ? 'animate-spin' : ''} />
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
