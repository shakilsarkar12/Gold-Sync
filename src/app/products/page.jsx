'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/Toast';
import {
  Search,
  RefreshCw,
  AlertCircle,
  ArrowUpRight,
  Save,
  HelpCircle
} from 'lucide-react';

export default function ProductsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [savingMetafieldsId, setSavingMetafieldsId] = useState(null);
  const [products, setProducts] = useState([]);
  const [currency, setCurrency] = useState('USD');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, gold, out_of_sync, synced
  
  // State for product-level edits: { [productId]: { weight, karat, diamondPrice } }
  const [editedMetafields, setEditedMetafields] = useState({});

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('Failed to fetch products');
      const data = await res.json();
      
      setProducts(data.products || []);
      if (data.goldRates) {
        setCurrency(data.goldRates.currency || 'USD');
      }

      // Initialize inline edit state at the product level
      const initialEdits = {};
      (data.products || []).forEach((p) => {
        initialEdits[p.id] = {
          weight: p.weightValue !== null ? p.weightValue.toString() : '',
          karat: p.karatValue || '',
          diamondPrice: p.diamondPrice !== undefined ? p.diamondPrice.toString() : '0',
        };
      });
      setEditedMetafields(initialEdits);
    } catch (error) {
      showToast(error.message || 'Error loading products', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    fetchProducts();
  }, [fetchProducts]);

  const handleMetafieldChange = (productId, field, value) => {
    setEditedMetafields((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value,
      },
    }));
  };

  const handleSaveMetafields = async (productId) => {
    setSavingMetafieldsId(productId);
    const edits = editedMetafields[productId];
    
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_metafields',
          productId,
          weight: edits.weight,
          karat: edits.karat,
          diamondPrice: edits.diamondPrice,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update product metafields');
      }

      showToast('Product metafields updated successfully', 'success');
      await fetchProducts();
    } catch (error) {
      showToast(error.message || 'Error updating product metafields', 'error');
    } finally {
      setSavingMetafieldsId(null);
    }
  };

  const handleSyncVariant = async (product, variant) => {
    setSyncingId(variant.id);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync_variant',
          productId: product.id,
          productTitle: product.title,
          variantId: variant.id,
          variantTitle: variant.title,
          newPrice: variant.calculatedPrice,
          oldPrice: variant.price,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to sync variant price');
      }

      showToast(`Synced price for ${product.title} (${variant.title})`, 'success');
      await fetchProducts();
    } catch (error) {
      showToast(error.message || 'Error syncing price', 'error');
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAll = async () => {
    const outOfSyncItems = [];
    products.forEach((p) => {
      p.variants.forEach((v) => {
        if (v.isGoldVariant && v.outOfSync) {
          outOfSyncItems.push({
            productId: p.id,
            productTitle: p.title,
            variantId: v.id,
            variantTitle: v.title,
            newPrice: v.calculatedPrice,
            oldPrice: v.price,
          });
        }
      });
    });

    if (outOfSyncItems.length === 0) {
      showToast('No variant prices require syncing', 'info');
      return;
    }

    setSyncingAll(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync_bulk',
          items: outOfSyncItems,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed bulk sync');

      showToast(`Bulk sync complete. Updated ${data.successCount} variant prices.`, 'success');
      await fetchProducts();
    } catch (error) {
      showToast(error.message || 'Error executing bulk sync', 'error');
    } finally {
      setSyncingAll(false);
    }
  };

  // Filter and search logic
  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.variants.some((v) => v.sku?.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (filterType === 'gold') return product.isGoldProduct;
    
    if (filterType === 'out_of_sync') {
      return product.variants.some((v) => v.isGoldVariant && v.outOfSync);
    }
    if (filterType === 'synced') {
      return product.isGoldProduct && product.variants.every((v) => !v.isGoldVariant || !v.outOfSync);
    }
    
    return true; // all
  });

  // Count out-of-sync variants globally
  let outOfSyncVariantsCount = 0;
  products.forEach((p) => {
    p.variants.forEach((v) => {
      if (v.isGoldVariant && v.outOfSync) outOfSyncVariantsCount++;
    });
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <div className="luxury-text gold-text-gradient loading-dots" style={{ fontSize: '1.5rem' }}>
          Loading Catalog
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
      <header className="page-header">
        <div>
          <h1 className="page-title luxury-text">Catalog Management</h1>
          <p className="page-subtitle">Update gold weights and diamond prices at product level, and sync variant prices</p>
        </div>
        {outOfSyncVariantsCount > 0 && (
          <button
            onClick={handleSyncAll}
            className="btn btn-primary"
            disabled={syncingAll}
          >
            <RefreshCw className={syncingAll ? 'animate-spin' : ''} size={16} />
            <span>{syncingAll ? 'Syncing...' : `Sync ${outOfSyncVariantsCount} Out-of-Sync Prices`}</span>
          </button>
        )}
      </header>

      {/* Filters and Search */}
      <div className="filters-bar glass-card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
        <div className="search-input-wrapper">
          <Search className="search-icon" size={16} />
          <input
            type="text"
            className="form-input"
            placeholder="Search by product name or SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <select
            className="form-input form-select"
            style={{ width: '200px', padding: '0.5rem 1rem' }}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">All Products</option>
            <option value="gold">Gold Products Only</option>
            <option value="out_of_sync">Price Update Needed</option>
            <option value="synced">Synced Products</option>
          </select>
        </div>
      </div>

      {/* Products and Variants Table */}
      {filteredProducts.length > 0 ? (
        <div className="table-container glass-card" style={{ padding: 0 }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th style={{ width: '260px' }}>Product & Variant Title</th>
                <th>Gold Weight (g)</th>
                <th>Karat</th>
                <th>Diamond Price</th>
                <th>Current Shopify</th>
                <th>Calculated Price</th>
                <th>Status</th>
                <th style={{ textAlign: 'right', width: '180px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const edits = editedMetafields[product.id] || { weight: '', karat: '', diamondPrice: '0' };
                const hasChanges =
                  edits.weight !== (product.weightValue?.toString() || '') ||
                  edits.karat !== (product.karatValue || '') ||
                  parseFloat(edits.diamondPrice || 0) !== (product.diamondPrice || 0);

                return (
                  <React.Fragment key={product.id}>
                    {/* Product Header Row (Editable Metadata Fields) */}
                    <tr style={{ background: 'rgba(255, 255, 255, 0.04)', borderBottom: '1px solid var(--border-color)' }}>
                      {/* Product Title */}
                      <td style={{ padding: '0.75rem 1.25rem' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                          <div
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(255,255,255,0.03)',
                              border: '1px solid var(--border-color)',
                              backgroundImage: product.featuredImage ? `url(${product.featuredImage.url})` : 'none',
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              flexShrink: 0
                            }}
                          />
                          <div>
                            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{product.title}</span>
                          </div>
                        </div>
                      </td>

                      {/* Product Weight Input */}
                      <td>
                        <input
                          type="number"
                          className="form-input"
                          style={{ width: '85px', padding: '0.35rem 0.5rem', textAlign: 'center', fontSize: '0.85rem', borderColor: 'var(--gold-primary)' }}
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                          value={edits.weight}
                          onChange={(e) => handleMetafieldChange(product.id, 'weight', e.target.value)}
                        />
                      </td>

                      {/* Product Karat Select */}
                      <td>
                        <select
                          className="form-input form-select"
                          style={{ width: '85px', padding: '0.35rem 0.5rem', paddingRight: '1.25rem', fontSize: '0.85rem', borderColor: 'var(--gold-primary)' }}
                          value={edits.karat}
                          onChange={(e) => handleMetafieldChange(product.id, 'karat', e.target.value)}
                        >
                          <option value="">Default</option>
                          <option value="24K">24K</option>
                          <option value="22K">22K</option>
                          <option value="21K">21K</option>
                          <option value="18K">18K</option>
                          <option value="14K">14K</option>
                          <option value="10K">10K</option>
                        </select>
                      </td>

                      {/* Product Diamond Price Input */}
                      <td>
                        <input
                          type="number"
                          className="form-input"
                          style={{ width: '90px', padding: '0.35rem 0.5rem', textAlign: 'center', fontSize: '0.85rem', borderColor: 'var(--gold-primary)' }}
                          placeholder="0"
                          min="0"
                          step="1"
                          value={edits.diamondPrice}
                          onChange={(e) => handleMetafieldChange(product.id, 'diamondPrice', e.target.value)}
                        />
                      </td>

                      {/* Current Shopify Price (Summary) */}
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {product.variants.length} Variants
                      </td>

                      {/* Calculated Price Column */}
                      <td>-</td>

                      {/* Product Status Column */}
                      <td>
                        {!product.isGoldProduct ? (
                          <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.03)', color: 'var(--text-secondary)' }}>No Weight</span>
                        ) : product.outOfSync ? (
                          <span className="badge badge-warning">Needs Sync</span>
                        ) : (
                          <span className="badge badge-success">Synced</span>
                        )}
                      </td>

                      {/* Product Save Button */}
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                          {hasChanges && (
                            <button
                              onClick={() => handleSaveMetafields(product.id)}
                              className="btn btn-secondary btn-small"
                              style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem', borderColor: 'var(--gold-primary)', color: 'var(--gold-primary)' }}
                              disabled={savingMetafieldsId === product.id}
                              title="Save Metafields to Shopify Product"
                            >
                              <Save size={12} className={savingMetafieldsId === product.id ? 'animate-spin' : ''} />
                              <span>Save Product</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Variant Sub-rows */}
                    {product.variants.map((variant) => (
                      <tr key={variant.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.02)' }}>
                        {/* Column 1: Variant Title / SKU */}
                        <td style={{ paddingLeft: '2.5rem' }}>
                          <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>
                            {variant.title}
                          </div>
                          {variant.sku && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                              SKU: {variant.sku}
                            </div>
                          )}
                        </td>

                        {/* Gold Weight - Inherited */}
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center' }}>
                          {product.weightValue ? `${product.weightValue}g` : '-'}
                        </td>

                        {/* Karat - Inherited or title parsed */}
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center' }}>
                          {variant.priceBreakdown?.karatUsed || '-'}
                        </td>

                        {/* Diamond Price - Inherited */}
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center' }}>
                          {product.diamondPrice ? `${currency} ${product.diamondPrice}` : '-'}
                        </td>

                        {/* Column 5: Current Price */}
                        <td style={{ fontSize: '0.85rem' }}>
                          {currency} {parseFloat(variant.price).toFixed(2)}
                        </td>

                        {/* Column 6: Target Calculated Price */}
                        <td>
                          {variant.isGoldVariant && variant.calculatedPrice !== null ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <span className="gold-text-gradient" style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                                {currency} {variant.calculatedPrice.toFixed(2)}
                              </span>
                              
                              {/* Breakdown Tooltip */}
                              {variant.priceBreakdown && (
                                <span className="tooltip-trigger">
                                  <HelpCircle size={12} color="var(--text-muted)" />
                                  <div className="tooltip-box" style={{ width: '220px', whiteSpace: 'normal' }}>
                                    <div style={{ fontWeight: 600, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', marginBottom: '0.25rem', color: 'var(--gold-primary)' }}>
                                      Pricing Breakdown ({variant.priceBreakdown.karatUsed})
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                                      <span>Gold Price/g:</span>
                                      <span>{currency} {variant.priceBreakdown.goldPricePerGram}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                                      <span>Gold Cost:</span>
                                      <span>{currency} {variant.priceBreakdown.baseGoldCost}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                                      <span>Diamond Price:</span>
                                      <span>{currency} {variant.priceBreakdown.diamondPrice}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                                      <span>Making Charges:</span>
                                      <span>{currency} {variant.priceBreakdown.makingCharges}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                                      <span>Markup amount:</span>
                                      <span>{currency} {variant.priceBreakdown.markupAmount}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                                      <span>Price Before Tax:</span>
                                      <span>{currency} {variant.priceBreakdown.priceBeforeTax}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border-color)', paddingTop: '0.2rem' }}>
                                      <span>GST Tax:</span>
                                      <span>{currency} {variant.priceBreakdown.gstAmount}</span>
                                    </div>
                                  </div>
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>N/A</span>
                          )}
                        </td>

                        {/* Column 7: Status */}
                        <td>
                          {!variant.isGoldVariant ? (
                            <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.03)', color: 'var(--text-secondary)' }}>No Weight</span>
                          ) : variant.outOfSync ? (
                            <span className="badge badge-warning">Needs Sync</span>
                          ) : (
                            <span className="badge badge-success">Synced</span>
                          )}
                        </td>

                        {/* Column 8: Actions (Sync Price) */}
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                            {variant.isGoldVariant && variant.outOfSync && (
                              <button
                                onClick={() => handleSyncVariant(product, variant)}
                                className="btn btn-primary btn-small"
                                style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}
                                disabled={syncingId === variant.id}
                              >
                                {syncingId === variant.id ? (
                                  <span>Syncing...</span>
                                ) : (
                                  <>
                                    <span>Sync Price</span>
                                    <ArrowUpRight size={12} />
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <AlertCircle size={36} color="var(--text-muted)" style={{ margin: '0 auto 1rem' }} />
          <h3>No Products Found</h3>
          <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Try adjusting your search filters, or verify that your Shopify Admin API settings are correct.
          </p>
        </div>
      )}
    </div>
  );
}
