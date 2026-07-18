'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '@/components/Toast';
import {
  Database,
  Save,
  CheckSquare,
  Square,
  Search,
  AlertCircle,
  CheckCircle,
  Layers,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';

const TARGET_MODE = {
  ALL: 'all',
  COLLECTION: 'collection',
  SPECIFIC: 'specific',
};

export default function MetafieldsPage() {
  const { showToast } = useToast();

  // Products & collections state
  const [allProducts, setAllProducts] = useState([]);
  const [collections, setCollections] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingCollections, setLoadingCollections] = useState(true);

  // Collection-specific products
  const [collectionProducts, setCollectionProducts] = useState([]);
  const [loadingCollectionProducts, setLoadingCollectionProducts] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState('');

  // Target mode
  const [targetMode, setTargetMode] = useState(TARGET_MODE.ALL);

  // Product search & selection (for SPECIFIC mode)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Metafield form
  const [namespace, setNamespace] = useState('custom');
  const [key, setKey] = useState('');
  const [type, setType] = useState('single_line_text_field');
  const [value, setValue] = useState('');

  // Update status
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState(null);
  const [progress, setProgress] = useState(null); // { done, total }

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchAllProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      // Use the lightweight endpoint that returns ALL active products (no gold filter)
      const res = await fetch('/api/collections?mode=products');
      if (!res.ok) throw new Error('Failed to load products');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAllProducts(data.products || []);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoadingProducts(false);
    }
  }, [showToast]);

  const fetchCollections = useCallback(async () => {
    setLoadingCollections(true);
    try {
      const res = await fetch('/api/collections');
      if (!res.ok) throw new Error('Failed to load collections');
      const data = await res.json();
      setCollections(data.collections || []);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoadingCollections(false);
    }
  }, [showToast]);

  const fetchCollectionProducts = useCallback(async (collectionId) => {
    if (!collectionId) return;
    setLoadingCollectionProducts(true);
    setSelectedIds(new Set());
    try {
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionId }),
      });
      if (!res.ok) throw new Error('Failed to load collection products');
      const data = await res.json();
      setCollectionProducts(data.products || []);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoadingCollectionProducts(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchAllProducts();
    fetchCollections();
  }, [fetchAllProducts, fetchCollections]);

  useEffect(() => {
    if (targetMode === TARGET_MODE.COLLECTION && selectedCollectionId) {
      fetchCollectionProducts(selectedCollectionId);
    }
  }, [targetMode, selectedCollectionId, fetchCollectionProducts]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const displayedProducts = useMemo(() => {
    if (targetMode === TARGET_MODE.COLLECTION) return collectionProducts;
    return allProducts;
  }, [targetMode, collectionProducts, allProducts]);

  const filteredProducts = useMemo(() => {
    if (!searchQuery) return displayedProducts;
    const q = searchQuery.toLowerCase();
    return displayedProducts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.handle.toLowerCase().includes(q) ||
        p.tags?.some((t) => t.toLowerCase().includes(q))
    );
  }, [displayedProducts, searchQuery]);

  // In ALL mode the target count is all products
  const targetCount = useMemo(() => {
    if (targetMode === TARGET_MODE.ALL) return allProducts.length;
    if (targetMode === TARGET_MODE.COLLECTION) return collectionProducts.length;
    return selectedIds.size;
  }, [targetMode, allProducts.length, collectionProducts.length, selectedIds.size]);

  // ── Selection helpers ──────────────────────────────────────────────────────
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
    }
  };

  const toggleProduct = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // ── Update handler ─────────────────────────────────────────────────────────
  const handleUpdate = async () => {
    if (!namespace || !key || !type) {
      showToast('Namespace, Key, and Type are required', 'error');
      return;
    }
    if (targetMode === TARGET_MODE.SPECIFIC && selectedIds.size === 0) {
      showToast('Please select at least one product', 'error');
      return;
    }
    if (targetMode === TARGET_MODE.COLLECTION && collectionProducts.length === 0) {
      showToast('No products in the selected collection', 'error');
      return;
    }

    // Build the list of product IDs to update
    let productIds;
    if (targetMode === TARGET_MODE.ALL) {
      productIds = allProducts.map((p) => p.id);
    } else if (targetMode === TARGET_MODE.COLLECTION) {
      productIds = collectionProducts.map((p) => p.id);
    } else {
      productIds = Array.from(selectedIds);
    }

    setIsUpdating(true);
    setUpdateResult(null);
    setProgress({ done: 0, total: productIds.length });

    const CHUNK = 25;
    let successCount = 0;
    const errors = [];

    try {
      for (let i = 0; i < productIds.length; i += CHUNK) {
        const chunk = productIds.slice(i, i + CHUNK);
        const res = await fetch('/api/metafields/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productIds: chunk, namespace, key, value, type }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Update failed');

        successCount += data.successCount || 0;
        if (data.errors?.length) errors.push(...data.errors);
        setProgress({ done: Math.min(i + CHUNK, productIds.length), total: productIds.length });
      }

      const success = errors.length === 0;
      setUpdateResult({ success, successCount, errors });
      showToast(
        success
          ? `Successfully updated ${successCount} product${successCount !== 1 ? 's' : ''}`
          : `Completed with errors. ${successCount} succeeded.`,
        success ? 'success' : 'warning'
      );
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setIsUpdating(false);
      setProgress(null);
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  // Show spinner only while BOTH initial fetches are still in flight
  if (loadingProducts || loadingCollections) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <div className="luxury-text gold-text-gradient loading-dots" style={{ fontSize: '1.5rem' }}>
          Loading
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
      <header className="page-header">
        <div>
          <h1 className="page-title luxury-text">Metafields Management</h1>
          <p className="page-subtitle">
            Update any metafield across all products, a specific collection, or hand-picked items
          </p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* ── Left: Form ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Metafield Details */}
          <div className="glass-card">
            <h2
              className="card-title luxury-text"
              style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}
            >
              <Database size={18} color="var(--gold-primary)" />
              <span>Metafield Details</span>
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="form-group">
                <label className="form-label">Namespace</label>
                <input
                  type="text"
                  className="form-input"
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                  placeholder="e.g. custom"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Key</label>
                <input
                  type="text"
                  className="form-input"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="e.g. gold_karat"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Type</label>
                <select
                  className="form-input"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                >
                  <option value="single_line_text_field">Single line text</option>
                  <option value="number_decimal">Number (decimal)</option>
                  <option value="number_integer">Number (integer)</option>
                  <option value="boolean">Boolean</option>
                  <option value="multi_line_text_field">Multi-line text</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Value</label>
                <input
                  type="text"
                  className="form-input"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Value to apply"
                />
              </div>
            </div>
          </div>

          {/* Target Mode */}
          <div className="glass-card">
            <h2
              className="card-title luxury-text"
              style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}
            >
              <Layers size={18} color="var(--gold-primary)" />
              <span>Target Products</span>
            </h2>

            {/* Mode tabs */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '0.4rem',
                marginBottom: '1rem',
              }}
            >
              {[
                { mode: TARGET_MODE.ALL, label: 'All Products' },
                { mode: TARGET_MODE.COLLECTION, label: 'By Collection' },
                { mode: TARGET_MODE.SPECIFIC, label: 'Hand-pick' },
              ].map(({ mode, label }) => (
                <button
                  key={mode}
                  onClick={() => {
                    setTargetMode(mode);
                    setSelectedIds(new Set());
                    setSearchQuery('');
                  }}
                  style={{
                    padding: '0.5rem 0.25rem',
                    borderRadius: '6px',
                    border: `1px solid ${targetMode === mode ? 'var(--gold-primary)' : 'var(--border-color)'}`,
                    backgroundColor: targetMode === mode ? 'rgba(212,175,55,0.12)' : 'transparent',
                    color: targetMode === mode ? 'var(--gold-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: targetMode === mode ? 600 : 400,
                    transition: 'all 0.2s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Collection picker */}
            {targetMode === TARGET_MODE.COLLECTION && (
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label">Select Collection</label>
                <div style={{ position: 'relative' }}>
                  <select
                    className="form-input"
                    value={selectedCollectionId}
                    onChange={(e) => setSelectedCollectionId(e.target.value)}
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      paddingRight: '2rem',
                      appearance: 'none',
                    }}
                  >
                    <option value="">— Choose a collection —</option>
                    {loadingCollections ? (
                      <option disabled>Loading…</option>
                    ) : (
                      collections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title} ({c.productsCount} products)
                        </option>
                      ))
                    )}
                  </select>
                  <ChevronDown
                    size={14}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                      color: 'var(--text-muted)',
                    }}
                  />
                </div>
                {loadingCollectionProducts && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    Loading collection products…
                  </p>
                )}
                {!loadingCollectionProducts && selectedCollectionId && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                    {collectionProducts.length} products in this collection
                  </p>
                )}
              </div>
            )}

            {/* Summary & action */}
            <div
              style={{
                padding: '0.85rem',
                backgroundColor: 'rgba(212, 175, 55, 0.05)',
                borderRadius: '8px',
                border: '1px solid rgba(212, 175, 55, 0.2)',
              }}
            >
              <p style={{ fontSize: '0.88rem', marginBottom: '0.6rem', color: 'var(--text-secondary)' }}>
                Products to update:{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{targetCount}</strong>
              </p>

              {/* Progress bar */}
              {isUpdating && progress && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <div
                    style={{
                      height: '6px',
                      borderRadius: '3px',
                      backgroundColor: 'var(--border-color)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${(progress.done / progress.total) * 100}%`,
                        background: 'linear-gradient(90deg, var(--gold-primary), var(--gold-secondary))',
                        transition: 'width 0.3s',
                        borderRadius: '3px',
                      }}
                    />
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    {progress.done} / {progress.total} products
                  </p>
                </div>
              )}

              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={handleUpdate}
                disabled={
                  isUpdating ||
                  !key ||
                  targetCount === 0 ||
                  (targetMode === TARGET_MODE.COLLECTION && !selectedCollectionId)
                }
              >
                {isUpdating ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                <span>
                  {isUpdating ? 'Updating…' : `Update ${targetCount} Product${targetCount !== 1 ? 's' : ''}`}
                </span>
              </button>
            </div>

            {/* Result */}
            {updateResult && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '0.85rem',
                  borderRadius: '8px',
                  border: `1px solid ${updateResult.success ? 'var(--success)' : 'var(--warning)'}`,
                  backgroundColor: updateResult.success
                    ? 'rgba(16, 185, 129, 0.08)'
                    : 'rgba(245, 158, 11, 0.08)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '0.4rem',
                    color: updateResult.success ? 'var(--success)' : 'var(--warning)',
                  }}
                >
                  {updateResult.success ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    {updateResult.success ? 'Update Complete' : 'Completed with Errors'}
                  </span>
                </div>
                <p style={{ fontSize: '0.82rem' }}>
                  Successfully updated: <strong>{updateResult.successCount}</strong>
                </p>
                {updateResult.errors?.length > 0 && (
                  <div
                    style={{
                      marginTop: '0.4rem',
                      maxHeight: '80px',
                      overflowY: 'auto',
                      fontSize: '0.78rem',
                      color: 'var(--danger, #ef4444)',
                    }}
                  >
                    {updateResult.errors.map((err, i) => (
                      <div key={i}>{err}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Product list (SPECIFIC & COLLECTION modes) ───────────── */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <h2 className="card-title luxury-text" style={{ margin: 0 }}>
              {targetMode === TARGET_MODE.ALL
                ? 'All Products Preview'
                : targetMode === TARGET_MODE.COLLECTION
                ? 'Collection Products'
                : 'Select Products'}
            </h2>

            <div style={{ position: 'relative', minWidth: '220px' }}>
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="text"
                className="form-input"
                placeholder="Search by title or tag…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '34px' }}
              />
            </div>
          </div>

          {/* Toolbar */}
          {targetMode === TARGET_MODE.SPECIFIC && (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
              <button className="btn btn-secondary btn-small" onClick={toggleSelectAll}>
                {selectedIds.size === filteredProducts.length && filteredProducts.length > 0 ? (
                  <>
                    <CheckSquare size={13} /> <span>Deselect All</span>
                  </>
                ) : (
                  <>
                    <Square size={13} /> <span>Select All Filtered</span>
                  </>
                )}
              </button>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {selectedIds.size} selected · {filteredProducts.length} shown
              </span>
            </div>
          )}

          {targetMode !== TARGET_MODE.SPECIFIC && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              {filteredProducts.length} products
              {targetMode === TARGET_MODE.ALL ? ' in your store (all will be updated)' : ' in this collection'}
            </p>
          )}

          {/* Table */}
          <div
            style={{
              overflowY: 'auto',
              maxHeight: '62vh',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
            }}
          >
            {loadingCollectionProducts ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading products…
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead
                  style={{
                    position: 'sticky',
                    top: 0,
                    backgroundColor: 'var(--bg-secondary)',
                    zIndex: 1,
                  }}
                >
                  <tr>
                    {targetMode === TARGET_MODE.SPECIFIC && (
                      <th style={{ padding: '0.7rem', width: '36px', textAlign: 'left' }} />
                    )}
                    <th style={{ padding: '0.7rem', textAlign: 'left', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      Product
                    </th>
                    <th style={{ padding: '0.7rem', textAlign: 'left', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      Tags
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    const isSelected = selectedIds.has(product.id);
                    const isClickable = targetMode === TARGET_MODE.SPECIFIC;
                    return (
                      <tr
                        key={product.id}
                        onClick={isClickable ? () => toggleProduct(product.id) : undefined}
                        style={{
                          borderBottom: '1px solid var(--border-color)',
                          cursor: isClickable ? 'pointer' : 'default',
                          backgroundColor: isSelected
                            ? 'rgba(212, 175, 55, 0.06)'
                            : 'transparent',
                          transition: 'background-color 0.15s',
                        }}
                      >
                        {targetMode === TARGET_MODE.SPECIFIC && (
                          <td style={{ padding: '0.7rem' }}>
                            {isSelected ? (
                              <CheckSquare size={17} color="var(--gold-primary)" />
                            ) : (
                              <Square size={17} color="var(--text-muted)" />
                            )}
                          </td>
                        )}
                        <td style={{ padding: '0.7rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            {product.featuredImage?.url ? (
                              <img
                                src={product.featuredImage.url}
                                alt={product.title}
                                style={{ width: '30px', height: '30px', borderRadius: '4px', objectFit: 'cover' }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: '30px',
                                  height: '30px',
                                  borderRadius: '4px',
                                  backgroundColor: 'var(--bg-secondary)',
                                  border: '1px solid var(--border-color)',
                                }}
                              />
                            )}
                            <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>{product.title}</span>
                          </div>
                        </td>
                        <td style={{ padding: '0.7rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {(product.tags || []).slice(0, 3).join(', ')}
                          {product.tags?.length > 3 ? ' …' : ''}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredProducts.length === 0 && (
                    <tr>
                      <td
                        colSpan={targetMode === TARGET_MODE.SPECIFIC ? 3 : 2}
                        style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}
                      >
                        {targetMode === TARGET_MODE.COLLECTION && !selectedCollectionId
                          ? 'Select a collection to see its products.'
                          : 'No products found.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
