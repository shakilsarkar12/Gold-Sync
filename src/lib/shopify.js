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
  
  // Product level mappings
  const weightNamespace = settings.weightNamespace || 'custom';
  const weightKey = settings.weightKey || 'gold_weight';
  const karatNamespace = settings.karatNamespace || 'custom';
  const karatKey = settings.karatKey || 'gold_karat';
  const diamondNamespace = settings.diamondNamespace || 'custom';
  const diamondKey = settings.diamondKey || 'diamond_price';

  // Variant level mappings
  const variantWeightNamespace = settings.variantWeightNamespace || 'custom';
  const variantWeightKey = settings.variantWeightKey || 'gold_weight';
  const variantKaratNamespace = settings.variantKaratNamespace || 'custom';
  const variantKaratKey = settings.variantKaratKey || 'gold_karat';
  const diamondShapeNamespace = settings.diamondShapeNamespace || 'custom';
  const diamondShapeKey = settings.diamondShapeKey || 'diamond_shape';
  const diamondCrtNamespace = settings.diamondCrtNamespace || 'custom';
  const diamondCrtKey = settings.diamondCrtKey || 'diamond_crt';
  const diamondColorNamespace = settings.diamondColorNamespace || 'custom';
  const diamondColorKey = settings.diamondColorKey || 'diamond_color';

  let shopifyQuery = 'status:ACTIVE';
  if (searchQuery) {
    shopifyQuery = `status:ACTIVE AND ${searchQuery}`;
  }

  const query = `
    query GetProducts(
      $first: Int!
      $after: String
      $query: String
      $weightNamespace: String!
      $weightKey: String!
      $karatNamespace: String!
      $karatKey: String!
      $diamondNamespace: String!
      $diamondKey: String!
      $variantWeightNamespace: String!
      $variantWeightKey: String!
      $variantKaratNamespace: String!
      $variantKaratKey: String!
      $diamondShapeNamespace: String!
      $diamondShapeKey: String!
      $diamondCrtNamespace: String!
      $diamondCrtKey: String!
      $diamondColorNamespace: String!
      $diamondColorKey: String!
    ) {
      products(first: $first, after: $after, query: $query) {
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
            variants(first: 100) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  id
                  title
                  price
                  sku
                  vWeightMetafield: metafield(namespace: $variantWeightNamespace, key: $variantWeightKey) {
                    id
                    value
                    type
                  }
                  vKaratMetafield: metafield(namespace: $variantKaratNamespace, key: $variantKaratKey) {
                    id
                    value
                    type
                  }
                  vShapeMetafield: metafield(namespace: $diamondShapeNamespace, key: $diamondShapeKey) {
                    id
                    value
                    type
                  }
                  vCrtMetafield: metafield(namespace: $diamondCrtNamespace, key: $diamondCrtKey) {
                    id
                    value
                    type
                  }
                  vColorMetafield: metafield(namespace: $diamondColorNamespace, key: $diamondColorKey) {
                    id
                    value
                    type
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const getVariables = (afterCursor) => ({
    first: 100,
    after: afterCursor,
    query: shopifyQuery || null,
    weightNamespace,
    weightKey,
    karatNamespace,
    karatKey,
    diamondNamespace,
    diamondKey,
    variantWeightNamespace,
    variantWeightKey,
    variantKaratNamespace,
    variantKaratKey,
    diamondShapeNamespace,
    diamondShapeKey,
    diamondCrtNamespace,
    diamondCrtKey,
    diamondColorNamespace,
    diamondColorKey,
  });

  // Helper to extract diamond carats and gold karat from variant title
  // Title format examples: "Yellow gold / 1.5ct / 18K", "White gold / 1ct / 14kt", "2ct / 18k"
  function parseVariantTitle(title) {
    if (!title) return { titleCrt: null, titleKarat: null };

    // Extract diamond carats — match patterns like "1ct", "1.5ct", "2 ct" (case insensitive)
    const crtMatch = title.match(/(\d+(?:\.\d+)?)\s*ct/i);
    const titleCrt = crtMatch ? parseFloat(crtMatch[1]) : null;

    // Extract gold karat — match patterns like "18K", "14K", "22K", "18kt", "14kt" (case insensitive)
    const karatMatch = title.match(/\b(\d{2})\s*k(?:t|arat)?\b/i);
    const titleKarat = karatMatch ? `${karatMatch[1]}K` : null;

    return { titleCrt, titleKarat };
  }

  // Helper to map a raw variant node to our shape
  function mapVariant(variant) {
    const { titleCrt, titleKarat } = parseVariantTitle(variant.title);

    // Metafield values take priority; fall back to title-parsed values
    const crtValue = variant.vCrtMetafield?.value
      ? parseFloat(variant.vCrtMetafield.value)
      : titleCrt;

    const karatValue = variant.vKaratMetafield?.value
      ? variant.vKaratMetafield.value
      : titleKarat;

    return {
      id: variant.id,
      title: variant.title,
      price: variant.price,
      sku: variant.sku || null,
      weightValue: variant.vWeightMetafield?.value ? parseFloat(variant.vWeightMetafield.value) : null,
      karatValue,
      shapeValue: variant.vShapeMetafield?.value || null,
      crtValue,
      colorValue: variant.vColorMetafield?.value || null,
      weightMetafieldId: variant.vWeightMetafield?.id,
      karatMetafieldId: variant.vKaratMetafield?.id,
      shapeMetafieldId: variant.vShapeMetafield?.id,
      crtMetafieldId: variant.vCrtMetafield?.id,
      colorMetafieldId: variant.vColorMetafield?.id,
    };
  }

  // Helper to paginate ALL variants for a single product using cursor
  async function fetchRemainingVariants(productId, afterCursor) {
    const variantPageQuery = `
      query GetProductVariants(
        $productId: ID!
        $after: String
        $variantWeightNamespace: String!
        $variantWeightKey: String!
        $variantKaratNamespace: String!
        $variantKaratKey: String!
        $diamondShapeNamespace: String!
        $diamondShapeKey: String!
        $diamondCrtNamespace: String!
        $diamondCrtKey: String!
        $diamondColorNamespace: String!
        $diamondColorKey: String!
      ) {
        product(id: $productId) {
          variants(first: 100, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                title
                price
                sku
                vWeightMetafield: metafield(namespace: $variantWeightNamespace, key: $variantWeightKey) {
                  id
                  value
                  type
                }
                vKaratMetafield: metafield(namespace: $variantKaratNamespace, key: $variantKaratKey) {
                  id
                  value
                  type
                }
                vShapeMetafield: metafield(namespace: $diamondShapeNamespace, key: $diamondShapeKey) {
                  id
                  value
                  type
                }
                vCrtMetafield: metafield(namespace: $diamondCrtNamespace, key: $diamondCrtKey) {
                  id
                  value
                  type
                }
                vColorMetafield: metafield(namespace: $diamondColorNamespace, key: $diamondColorKey) {
                  id
                  value
                  type
                }
              }
            }
          }
        }
      }
    `;

    const allVariants = [];
    let cursor = afterCursor;
    let hasMore = true;

    while (hasMore) {
      const data = await shopifyGraphQL(variantPageQuery, {
        productId,
        after: cursor,
        variantWeightNamespace,
        variantWeightKey,
        variantKaratNamespace,
        variantKaratKey,
        diamondShapeNamespace,
        diamondShapeKey,
        diamondCrtNamespace,
        diamondCrtKey,
        diamondColorNamespace,
        diamondColorKey,
      });

      const variantsPage = data.product?.variants;
      const edges = variantsPage?.edges || [];
      allVariants.push(...edges.map(({ node }) => mapVariant(node)));

      hasMore = variantsPage?.pageInfo?.hasNextPage || false;
      cursor = variantsPage?.pageInfo?.endCursor || null;
    }

    return allVariants;
  }

  try {
    const allProducts = [];
    let hasMoreProducts = true;
    let productCursor = null;

    while (hasMoreProducts) {
      const data = await shopifyGraphQL(query, getVariables(productCursor));
      const productsPage = data.products;
      const edges = productsPage?.edges || [];

      // Map initial page of variants and collect products needing more variant pages
      const mappedProducts = await Promise.all(edges.map(async ({ node }) => {
        const weightValue = node.weightMetafield?.value ? parseFloat(node.weightMetafield.value) : null;
        const karatValue = node.karatMetafield?.value || null;
        const diamondPrice = node.diamondMetafield?.value ? parseFloat(node.diamondMetafield.value) : 0;

        const variantsPage = node.variants;
        let variants = (variantsPage?.edges || []).map(({ node: variant }) => mapVariant(variant));

        // If there are more variant pages, fetch them all
        if (variantsPage?.pageInfo?.hasNextPage) {
          const extraVariants = await fetchRemainingVariants(node.id, variantsPage.pageInfo.endCursor);
          variants = [...variants, ...extraVariants];
        }

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
      }));

      allProducts.push(...mappedProducts);

      hasMoreProducts = productsPage?.pageInfo?.hasNextPage || false;
      productCursor = productsPage?.pageInfo?.endCursor || null;
    }

    return allProducts;
  } catch (error) {
    const settings = await getSettings();
    if (!settings.shopifyShop || !settings.shopifyAccessToken) {
      console.warn('Shopify credentials not fully configured. Returning empty list.');
      return [];
    }
    throw error;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function updateShopifyVariantPricesBulk(productId, variantsUpdates) {
  // variantsUpdates should be an array of { id: variantId, price: newPrice }
  if (!variantsUpdates || variantsUpdates.length === 0) return true;

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
    variants: variantsUpdates,
  };

  const data = await shopifyGraphQL(mutation, variables);
  const errors = data.productVariantsBulkUpdate?.userErrors || [];
  
  if (errors.length > 0) {
    throw new Error(`Shopify Variant Update Error: ${errors.map((e) => e.message).join(', ')}`);
  }

  // Sleep slightly to avoid token bucket exhaustion
  await sleep(250);

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

export async function updateShopifyVariantMetafieldsBulk(variantsData) {
  // variantsData should be an array of: { variantId, weight, karat, shape, crt, color }
  if (!variantsData || variantsData.length === 0) return true;

  const settings = await getSettings();
  
  const variantWeightNamespace = settings.variantWeightNamespace || 'custom';
  const variantWeightKey = settings.variantWeightKey || 'gold_weight';
  
  const variantKaratNamespace = settings.variantKaratNamespace || 'custom';
  const variantKaratKey = settings.variantKaratKey || 'gold_karat';
  
  const diamondShapeNamespace = settings.diamondShapeNamespace || 'custom';
  const diamondShapeKey = settings.diamondShapeKey || 'diamond_shape';
  
  const diamondCrtNamespace = settings.diamondCrtNamespace || 'custom';
  const diamondCrtKey = settings.diamondCrtKey || 'diamond_crt';
  
  const diamondColorNamespace = settings.diamondColorNamespace || 'custom';
  const diamondColorKey = settings.diamondColorKey || 'diamond_color';

  const mutation = `
    mutation UpdateVariantMetafields($metafields: [MetafieldsSetInput!]!) {
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

  let allMetafields = [];

  for (const data of variantsData) {
    const { variantId, weight, karat, shape, crt, color } = data;

    if (weight !== null && weight !== undefined) {
      allMetafields.push({
        ownerId: variantId,
        namespace: variantWeightNamespace,
        key: variantWeightKey,
        value: weight.toString(),
        type: 'single_line_text_field',
      });
    }

    if (karat !== null && karat !== undefined) {
      allMetafields.push({
        ownerId: variantId,
        namespace: variantKaratNamespace,
        key: variantKaratKey,
        value: karat.trim(),
        type: 'single_line_text_field',
      });
    }

    if (shape !== null && shape !== undefined) {
      allMetafields.push({
        ownerId: variantId,
        namespace: diamondShapeNamespace,
        key: diamondShapeKey,
        value: shape.trim(),
        type: 'single_line_text_field',
      });
    }

    if (crt !== null && crt !== undefined) {
      allMetafields.push({
        ownerId: variantId,
        namespace: diamondCrtNamespace,
        key: diamondCrtKey,
        value: crt.toString(),
        type: 'single_line_text_field',
      });
    }

    if (color !== null && color !== undefined) {
      allMetafields.push({
        ownerId: variantId,
        namespace: diamondColorNamespace,
        key: diamondColorKey,
        value: color.trim(),
        type: 'single_line_text_field',
      });
    }
  }

  if (allMetafields.length === 0) return true;

  // Shopify allows max 25 metafields per metafieldsSet mutation
  const CHUNK_SIZE = 25;
  for (let i = 0; i < allMetafields.length; i += CHUNK_SIZE) {
    const chunk = allMetafields.slice(i, i + CHUNK_SIZE);
    const variables = { metafields: chunk };
    
    const response = await shopifyGraphQL(mutation, variables);
    const errors = response.metafieldsSet?.userErrors || [];

    if (errors.length > 0) {
      throw new Error(`Shopify Variant Metafields Set Error: ${errors.map((e) => e.message).join(', ')}`);
    }

    // Sleep slightly to avoid token bucket exhaustion
    await sleep(250);
  }

  return true;
}
