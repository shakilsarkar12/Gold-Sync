import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/db';
import { shopifyGraphQL } from '@/lib/shopify';

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

      const response = await shopifyGraphQL(mutation, variables);
      
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
