import { NextResponse } from 'next/server';
import { shopifyGraphQL } from '@/lib/shopify';

export const dynamic = 'force-dynamic';

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
