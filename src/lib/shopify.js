import { getSettings } from './db';

async function shopifyGraphQL(query, variables = {}) {
  const settings = await getSettings();
  const shop = settings.shopifyShop;
  const token = settings.shopifyAccessToken;

  if (!shop || !token) {
    throw new Error('Shopify credentials are not configured in settings.');
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
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify API returned status ${response.status}: ${errorText || response.statusText}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(`Shopify GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
  }

  return result.data;
}

export async function fetchShopifyProducts(searchQuery) {
  const settings = await getSettings();
  const weightNamespace = settings.weightNamespace || 'custom';
  const weightKey = settings.weightKey || 'gold_weight';
  const karatNamespace = settings.karatNamespace || 'custom';
  const karatKey = settings.karatKey || 'gold_karat';
  const diamondNamespace = settings.diamondNamespace || 'custom';
  const diamondKey = settings.diamondKey || 'diamond_price';

  let shopifyQuery = '';
  if (searchQuery) {
    shopifyQuery = searchQuery;
  }

  const query = `
    query GetProducts(
      $first: Int!
      $query: String
      $weightNamespace: String!
      $weightKey: String!
      $karatNamespace: String!
      $karatKey: String!
      $diamondNamespace: String!
      $diamondKey: String!
    ) {
      products(first: $first, query: $query) {
        edges {
          node {
            id
            title
            handle
            tags
            featuredImage {
              url
            }
            weightMetafield: metafield(namespace: $weightNamespace, key: $weightKey) {
              id
              value
              type
            }
            karatMetafield: metafield(namespace: $karatNamespace, key: $karatKey) {
              id
              value
              type
            }
            diamondMetafield: metafield(namespace: $diamondNamespace, key: $diamondKey) {
              id
              value
              type
            }
            variants(first: 20) {
              edges {
                node {
                  id
                  title
                  price
                  sku
                }
              }
            }
          }
        }
      }
    }
  `;

  const variables = {
    first: 100,
    query: shopifyQuery || null,
    weightNamespace,
    weightKey,
    karatNamespace,
    karatKey,
    diamondNamespace,
    diamondKey,
  };

  try {
    const data = await shopifyGraphQL(query, variables);
    const edges = data.products?.edges || [];

    return edges.map(({ node }) => {
      const weightValue = node.weightMetafield?.value ? parseFloat(node.weightMetafield.value) : null;
      const karatValue = node.karatMetafield?.value || null;
      const diamondPrice = node.diamondMetafield?.value ? parseFloat(node.diamondMetafield.value) : 0;

      const variants = (node.variants?.edges || []).map(({ node: variant }) => ({
        id: variant.id,
        title: variant.title,
        price: variant.price,
        sku: variant.sku || null,
      }));

      return {
        id: node.id,
        title: node.title,
        handle: node.handle,
        tags: node.tags || [],
        featuredImage: node.featuredImage ? { url: node.featuredImage.url } : null,
        weightValue,
        karatValue,
        diamondPrice,
        weightMetafieldId: node.weightMetafield?.id,
        karatMetafieldId: node.karatMetafield?.id,
        diamondMetafieldId: node.diamondMetafield?.id,
        variants,
      };
    });
  } catch (error) {
    const settings = await getSettings();
    if (!settings.shopifyShop || !settings.shopifyAccessToken) {
      console.warn('Shopify credentials not fully configured. Returning empty list.');
      return [];
    }
    throw error;
  }
}

export async function updateShopifyVariantPrice(productId, variantId, newPrice) {
  const mutation = `
    mutation ProductVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    productId,
    variants: [
      {
        id: variantId,
        price: newPrice,
      },
    ],
  };

  const data = await shopifyGraphQL(mutation, variables);
  const errors = data.productVariantsBulkUpdate?.userErrors || [];
  
  if (errors.length > 0) {
    throw new Error(`Shopify Variant Update Error: ${errors.map((e) => e.message).join(', ')}`);
  }

  return true;
}

export async function updateShopifyProductMetafields(productId, weight, karat, diamondPrice) {
  const settings = await getSettings();
  const weightNamespace = settings.weightNamespace || 'custom';
  const weightKey = settings.weightKey || 'gold_weight';
  const karatNamespace = settings.karatNamespace || 'custom';
  const karatKey = settings.karatKey || 'gold_karat';
  const diamondNamespace = settings.diamondNamespace || 'custom';
  const diamondKey = settings.diamondKey || 'diamond_price';

  const mutation = `
    mutation UpdateProductMetafields($metafields: [MetafieldsSetInput!]!) {
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

  const metafields = [];

  if (weight !== null && weight !== undefined) {
    metafields.push({
      ownerId: productId,
      namespace: weightNamespace,
      key: weightKey,
      value: weight.toString(),
      type: 'number_decimal',
    });
  }

  if (karat !== null && karat !== undefined) {
    metafields.push({
      ownerId: productId,
      namespace: karatNamespace,
      key: karatKey,
      value: karat.trim(),
      type: 'single_line_text_field',
    });
  }

  if (diamondPrice !== null && diamondPrice !== undefined) {
    metafields.push({
      ownerId: productId,
      namespace: diamondNamespace,
      key: diamondKey,
      value: diamondPrice.toString(),
      type: 'number_decimal',
    });
  }

  if (metafields.length === 0) return true;

  const variables = { metafields };
  const data = await shopifyGraphQL(mutation, variables);
  const errors = data.metafieldsSet?.userErrors || [];

  if (errors.length > 0) {
    throw new Error(`Shopify Metafields Set Error: ${errors.map((e) => e.message).join(', ')}`);
  }

  return true;
}
