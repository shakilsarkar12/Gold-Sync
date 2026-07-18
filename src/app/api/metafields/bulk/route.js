import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/db';
// Need to import a GraphQL executor. I will create a helper here since shopifyGraphQL is not exported.

async function executeShopifyGraphQL(query, variables = {}) {
  const settings = await getSettings();
  const shop = settings.shopifyShop;
  let token = settings.shopifyDynamicToken || settings.shopifyAccessToken;

  let cleanShop = shop.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!cleanShop.includes('.myshopify.com')) {
    cleanShop = `${cleanShop}.myshopify.com`;
  }
  const url = `https://${cleanShop}/admin/api/2024-04/graphql.json`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${text}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(`Shopify GraphQL error: ${result.errors.map(e => e.message).join(', ')}`);
  }
  return result.data;
}

export async function POST(request) {
  try {
    const { productIds, namespace, key, value, type } = await request.json();

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ error: 'productIds array is required' }, { status: 400 });
    }
    if (!namespace || !key || !type) {
      return NextResponse.json({ error: 'namespace, key, and type are required' }, { status: 400 });
    }

    const settings = await getSettings();
    if (!settings.shopifyShop) {
      return NextResponse.json({ error: 'Shopify Store URL is not configured' }, { status: 400 });
    }

    const mutation = `
      mutation UpdateProductMetafieldsBulk($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const CHUNK_SIZE = 25;
    let successCount = 0;
    let errors = [];

    const allMetafields = productIds.map(id => ({
      ownerId: id,
      namespace: namespace,
      key: key,
      value: value !== null && value !== undefined ? value.toString() : "",
      type: type
    }));

    for (let i = 0; i < allMetafields.length; i += CHUNK_SIZE) {
      const chunk = allMetafields.slice(i, i + CHUNK_SIZE);
      const variables = { metafields: chunk };

      const response = await executeShopifyGraphQL(mutation, variables);
      
      const userErrors = response.metafieldsSet?.userErrors || [];
      if (userErrors.length > 0) {
        errors.push(...userErrors.map(e => e.message));
      } else {
        successCount += chunk.length;
      }
      
      // Delay to avoid token bucket exhaustion
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    return NextResponse.json({ 
      success: errors.length === 0, 
      successCount, 
      errors,
      message: errors.length === 0 ? 'Metafields updated successfully' : 'Updated with some errors'
    });
  } catch (error) {
    console.error('Bulk metafield update error:', error);
    return NextResponse.json({ error: error.message || 'Operation failed' }, { status: 500 });
  }
}
