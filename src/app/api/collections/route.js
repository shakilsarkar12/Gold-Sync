import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function shopifyGraphQL(query, variables = {}) {
  const settings = await getSettings();
  const shop = settings.shopifyShop;
  const token = settings.shopifyDynamicToken || settings.shopifyAccessToken;

  if (!shop || !token) {
    throw new Error('Shopify Store URL or token is not configured.');
  }

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
    cache: 'no-store',
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

// GET /api/collections?mode=products  → lightweight list of ALL active products
// GET /api/collections                → list of all Shopify collections
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode');

    // ── Return all products (lightweight, no gold filter) ─────────────────
    if (mode === 'products') {
      const query = `
        query GetAllProducts($first: Int!, $after: String) {
          products(first: $first, after: $after, query: "status:ACTIVE") {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                id
                title
                handle
                tags
                featuredImage { url }
              }
            }
          }
        }
      `;
      const allProducts = [];
      let hasMore = true;
      let cursor = null;
      while (hasMore) {
        const data = await shopifyGraphQL(query, { first: 100, after: cursor });
        const page = data.products;
        const edges = page?.edges || [];
        allProducts.push(
          ...edges.map(({ node }) => ({
            id: node.id,
            title: node.title,
            handle: node.handle,
            tags: node.tags || [],
            featuredImage: node.featuredImage ? { url: node.featuredImage.url } : null,
          }))
        );
        hasMore = page?.pageInfo?.hasNextPage || false;
        cursor = page?.pageInfo?.endCursor || null;
      }
      return NextResponse.json({ products: allProducts });
    }

    // ── Return collections list ────────────────────────────────────────────
    // Note: productsCount is intentionally omitted — it changed type across
    // Shopify API versions and causes GraphQL errors if queried incorrectly.
    const query = `
      query GetCollections($first: Int!, $after: String) {
        collections(first: $first, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              handle
            }
          }
        }
      }
    `;

    const allCollections = [];
    let hasMore = true;
    let cursor = null;

    while (hasMore) {
      const data = await shopifyGraphQL(query, { first: 100, after: cursor });
      const page = data.collections;
      const edges = page?.edges || [];
      allCollections.push(
        ...edges.map(({ node }) => ({
          id: node.id,
          title: node.title,
          handle: node.handle,
        }))
      );
      hasMore = page?.pageInfo?.hasNextPage || false;
      cursor = page?.pageInfo?.endCursor || null;
    }

    return NextResponse.json({ collections: allCollections });
  } catch (error) {
    console.error('Collections fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/collections — fetch products inside a specific collection
export async function POST(request) {
  try {
    const { collectionId } = await request.json();
    if (!collectionId) {
      return NextResponse.json({ error: 'collectionId is required' }, { status: 400 });
    }

    const query = `
      query GetCollectionProducts($id: ID!, $first: Int!, $after: String) {
        collection(id: $id) {
          id
          title
          products(first: $first, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                title
                handle
                tags
                featuredImage { url }
              }
            }
          }
        }
      }
    `;

    const allProducts = [];
    let hasMore = true;
    let cursor = null;

    while (hasMore) {
      const data = await shopifyGraphQL(query, { id: collectionId, first: 100, after: cursor });
      const collection = data.collection;
      if (!collection) {
        return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
      }
      const page = collection.products;
      const edges = page?.edges || [];
      allProducts.push(
        ...edges.map(({ node }) => ({
          id: node.id,
          title: node.title,
          handle: node.handle,
          tags: node.tags || [],
          featuredImage: node.featuredImage ? { url: node.featuredImage.url } : null,
        }))
      );
      hasMore = page?.pageInfo?.hasNextPage || false;
      cursor = page?.pageInfo?.endCursor || null;
    }

    return NextResponse.json({ products: allProducts });
  } catch (error) {
    console.error('Collection products fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
