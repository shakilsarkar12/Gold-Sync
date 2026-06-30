import { getSettings, updateDynamicToken } from './db';

async function refreshShopifyToken(shop) {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET is missing from .env');
  }

  let cleanShop = shop.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!cleanShop.includes('.myshopify.com')) {
    cleanShop = `${cleanShop}.myshopify.com`;
  }

  const url = `https://${cleanShop}/admin/oauth/access_token`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Shopify token: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('No access token returned from Shopify');
  }

  await updateDynamicToken(data.access_token);
  return data.access_token;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function shopifyGraphQL(query, variables = {}, retries = 3) {
  const settings = await getSettings();
  const shop = settings.shopifyShop;

  if (!shop) {
    throw new Error('Shopify Store URL is not configured in settings.');
  }

  const TWENTY_THREE_HOURS = 23 * 60 * 60 * 1000;
  const lastUpdated = settings.shopifyTokenUpdatedAt || 0;
  const age = Date.now() - lastUpdated;

  let token = settings.shopifyDynamicToken;

  // If the dynamic token is missing or older than 23 hours, refresh it
  if (!token || age > TWENTY_THREE_HOURS) {
    console.log('Fetching new Shopify dynamic token via client credentials...');
    token = await refreshShopifyToken(shop);
  }

  if (!token) {
    throw new Error('Failed to acquire Shopify access token.');
  }

  let cleanShop = shop.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!cleanShop.includes('.myshopify.com')) {
    cleanShop = `${cleanShop}.myshopify.com`;
  }

  const url = `https://${cleanShop}/admin/api/2024-04/graphql.json`;

  for (let i = 0; i <= retries; i++) {
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
      const errorText = await response.text();
      // On 429 Too Many Requests, retry as well
      if (response.status === 429 && i < retries) {
        console.warn(`[Shopify] 429 Too Many Requests. Retrying in ${2000 * (i + 1)}ms...`);
        await sleep(2000 * (i + 1));
        continue;
      }
      throw new Error(`Shopify API returned status ${response.status}: ${errorText || response.statusText}`);
    }

    const result = await response.json();
    if (result.errors) {
      const isThrottled = result.errors.some(e => 
        e.message === 'Throttled' || 
        (e.extensions && e.extensions.code === 'THROTTLED')
      );
      
      if (isThrottled && i < retries) {
        console.warn(`[Shopify GraphQL] Throttled. Retrying in ${2000 * (i + 1)}ms...`);
        await sleep(2000 * (i + 1));
        continue;
      }
      
      throw new Error(`Shopify GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
    }

    return result.data;
  }
}

export async function fetchShopifyProducts(searchQuery, bypassCache = false) {
  const { getProductsCache, setProductsCache } = await import('./db.js');
  
  if (!bypassCache && !searchQuery) {
    const cache = await getProductsCache();
    if (cache && cache.products && cache.timestamp) {
      const ONE_HOUR = 60 * 60 * 1000;
      if (Date.now() - cache.timestamp < ONE_HOUR) {
        console.log('[Shopify API] Serving products from cache.');
        return cache.products;
      }
    }
  }

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
  // Small diamond input metafields
  const sdGradeNamespace = settings.smallDiamondGradeNamespace || 'custom';
  const sdGradeKey = settings.smallDiamondGradeKey || 'small_diamonds_grade';
  const sdWeightNamespace = settings.smallDiamondWeightNamespace || 'custom';
  const sdWeightKey = settings.smallDiamondWeightKey || 'small_diamonds_weight';

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
      $sdGradeNamespace: String!
      $sdGradeKey: String!
      $sdWeightNamespace: String!
      $sdWeightKey: String!
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
                  selectedOptions {
                    name
                    value
                  }
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
                  vSmallDiamGradeMetafield: metafield(namespace: $sdGradeNamespace, key: $sdGradeKey) {
                    id
                    value
                    type
                  }
                  vSmallDiamWeightMetafield: metafield(namespace: $sdWeightNamespace, key: $sdWeightKey) {
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
    sdGradeNamespace,
    sdGradeKey,
    sdWeightNamespace,
    sdWeightKey,
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

    // Check if variant has an option named "Gold" (e.g. 14K, 18K)
    const goldOption = (variant.selectedOptions || []).find(
      (o) => o.name.toLowerCase() === 'gold'
    );

    return {
      id: variant.id,
      title: variant.title,
      price: variant.price,
      sku: variant.sku || null,
      selectedOptions: variant.selectedOptions || [],
      isGoldVariant: true,
      goldOptionValue: goldOption ? goldOption.value : null, // e.g. "14K", "18K"
      weightValue: variant.vWeightMetafield?.value ? parseFloat(variant.vWeightMetafield.value) : null,
      karatValue,
      shapeValue: variant.vShapeMetafield?.value || null,
      crtValue,
      colorValue: variant.vColorMetafield?.value || null,
      smallDiamondGrade: variant.vSmallDiamGradeMetafield?.value || null,
      smallDiamondWeight: variant.vSmallDiamWeightMetafield?.value
        ? parseFloat(variant.vSmallDiamWeightMetafield.value)
        : null,
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
        $sdGradeNamespace: String!
        $sdGradeKey: String!
        $sdWeightNamespace: String!
        $sdWeightKey: String!
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
                selectedOptions {
                  name
                  value
                }
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
                vSmallDiamGradeMetafield: metafield(namespace: $sdGradeNamespace, key: $sdGradeKey) {
                  id
                  value
                  type
                }
                vSmallDiamWeightMetafield: metafield(namespace: $sdWeightNamespace, key: $sdWeightKey) {
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
        sdGradeNamespace,
        sdGradeKey,
        sdWeightNamespace,
        sdWeightKey,
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
      const mappedProducts = [];
      for (const edge of edges) {
        const { node } = edge;
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

        // Only keep variants that have a "Gold" selectedOption (e.g. 14K, 18K)
        const goldVariants = variants.filter((v) => v.isGoldVariant);

        mappedProducts.push({
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
          variants: goldVariants,
          _hasGoldVariants: goldVariants.length > 0,
        });
      }

      // Only include products that have at least one variant with a "Gold" option
      const goldProducts = mappedProducts.filter((p) => p._hasGoldVariants);
      // Clean up the internal flag before storing
      goldProducts.forEach((p) => delete p._hasGoldVariants);

      allProducts.push(...goldProducts);

      hasMoreProducts = productsPage?.pageInfo?.hasNextPage || false;
      productCursor = productsPage?.pageInfo?.endCursor || null;
    }

    if (!searchQuery) {
      await setProductsCache(allProducts);
    }

    return allProducts;
  } catch (error) {
    const settings = await getSettings();
    if (!settings.shopifyShop) {
      console.warn('Shopify store URL not configured. Returning empty list.');
      return [];
    }
    throw error;
  }
}


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
        type: 'number_decimal',
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
        type: 'number_decimal',
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

export async function runBulkProductVariantsUpdate(jsonlString) {
  // 1. Get staged upload target
  const stagedQuery = `
    mutation {
      stagedUploadsCreate(input: [{
        resource: BULK_MUTATION_VARIABLES,
        filename: "bulk_updates.jsonl",
        mimeType: "text/jsonl",
        httpMethod: POST
      }]) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors { field message }
      }
    }
  `;
  const stagedData = await shopifyGraphQL(stagedQuery);
  const target = stagedData.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) {
    throw new Error(`Failed to create staged upload: ${JSON.stringify(stagedData.stagedUploadsCreate?.userErrors)}`);
  }

  // 2. Upload the JSONL file
  const formData = new FormData();
  for (const param of target.parameters) {
    formData.append(param.name, param.value);
  }
  formData.append('file', new Blob([jsonlString], { type: 'text/jsonl' }), 'bulk_updates.jsonl');

  const uploadRes = await fetch(target.url, {
    method: 'POST',
    body: formData,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Failed to upload to Shopify staged target: ${uploadRes.status} ${errText}`);
  }

  // 3. Trigger bulk operation
  const bulkMutation = `
    mutation bulkOperationRunMutation($stagedUploadPath: String!) {
      bulkOperationRunMutation(
        mutation: "mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { message } } }",
        stagedUploadPath: $stagedUploadPath
      ) {
        bulkOperation {
          id
          url
          status
        }
        userErrors {
          message
        }
      }
    }
  `;
  const bulkData = await shopifyGraphQL(bulkMutation, { stagedUploadPath: target.resourceUrl });
  const bulkOp = bulkData.bulkOperationRunMutation?.bulkOperation;
  const userErrs = bulkData.bulkOperationRunMutation?.userErrors;

  if (userErrs && userErrs.length > 0) {
    throw new Error(`Bulk Operation Trigger Error: ${userErrs.map(e => e.message).join(', ')}`);
  }

  return bulkOp.id;
}

/**
 * Writes computed pricing breakdown values to variant-level metafields.
 * Called during every sync so the Shopify theme can display a full price breakdown.
 *
 * @param {Array}  variantsData  - [{ variantId, breakdown }]
 * @param {Object} settings      - App settings from getSettings()
 */
export async function updateVariantBreakdownMetafields(variantsData, settings) {
  if (!settings.priceBreakdownEnabled) return true;
  if (!variantsData || variantsData.length === 0) return true;

  const mutation = `
    mutation UpdateVariantBreakdown($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key value }
        userErrors { field message }
      }
    }
  `;

  // Resolve output metafield keys from settings
  const rateNs     = (settings.bdGoldRatePerGramNamespace  || 'custom').trim();
  const rateKey    = (settings.bdGoldRatePerGramKey         || 'gold_rate_per_gram').trim();
  const goldValNs  = (settings.bdTotalGoldValueNamespace    || 'custom').trim();
  const goldValKey = (settings.bdTotalGoldValueKey           || 'total_gold_value').trim();
  const csValNs    = (settings.bdCentreStoneValueNamespace   || 'custom').trim();
  const csValKey   = (settings.bdCentreStoneValueKey          || 'centre_stone_value').trim();
  const sdValNs    = (settings.bdSmallDiamondValueNamespace   || 'custom').trim();
  const sdValKey   = (settings.bdSmallDiamondValueKey          || 'small_diamonds_value').trim();
  const mkRateNs   = (settings.bdMakingChargeRateNamespace    || 'custom').trim();
  const mkRateKey  = (settings.bdMakingChargeRateKey           || 'making_charge_per_gram').trim();
  const mkTotalNs  = (settings.bdTotalMakingNamespace          || 'custom').trim();
  const mkTotalKey = (settings.bdTotalMakingKey                 || 'total_making_charge').trim();

  let allMetafields = [];

  for (const { variantId, breakdown } of variantsData) {
    // 1. Gold rate per gram (karat-adjusted)
    if (breakdown.goldRatePerGram != null) {
      allMetafields.push({ ownerId: variantId, namespace: rateNs, key: rateKey,
        value: String(Number(breakdown.goldRatePerGram.toFixed(4))), type: 'number_decimal' });
    }
    // 2. Total gold value (weight × rate)
    if (breakdown.totalGoldValue != null) {
      allMetafields.push({ ownerId: variantId, namespace: goldValNs, key: goldValKey,
        value: String(Number(breakdown.totalGoldValue.toFixed(2))), type: 'number_decimal' });
    }
    // 3. Centre stone value
    if (breakdown.centreStoneValue != null) {
      allMetafields.push({ ownerId: variantId, namespace: csValNs, key: csValKey,
        value: String(Number(breakdown.centreStoneValue.toFixed(2))), type: 'number_decimal' });
    }
    // 4. Small diamonds value
    if (breakdown.smallDiamondValue != null) {
      allMetafields.push({ ownerId: variantId, namespace: sdValNs, key: sdValKey,
        value: String(Number(breakdown.smallDiamondValue.toFixed(2))), type: 'number_decimal' });
    }
    // 5. Making charge per gram (from settings)
    if (breakdown.makingChargeRate != null) {
      allMetafields.push({ ownerId: variantId, namespace: mkRateNs, key: mkRateKey,
        value: String(Number(breakdown.makingChargeRate)), type: 'number_decimal' });
    }
    // 6. Total making charge
    if (breakdown.totalMakingCharge != null) {
      allMetafields.push({ ownerId: variantId, namespace: mkTotalNs, key: mkTotalKey,
        value: String(Number(breakdown.totalMakingCharge.toFixed(2))), type: 'number_decimal' });
    }
  }

  if (allMetafields.length === 0) return true;

  const CHUNK_SIZE = 25;
  for (let i = 0; i < allMetafields.length; i += CHUNK_SIZE) {
    const chunk = allMetafields.slice(i, i + CHUNK_SIZE);
    const response = await shopifyGraphQL(mutation, { metafields: chunk });
    const errors = response.metafieldsSet?.userErrors || [];
    if (errors.length > 0) {
      throw new Error(`Variant Breakdown Metafields Error: ${errors.map((e) => e.message).join(', ')}`);
    }
    await sleep(250);
  }

  console.log(`[Breakdown MF] Updated breakdown metafields for ${variantsData.length} variants.`);
  return true;
}

export async function getCurrentBulkOperation() {
  const query = `
    query {
      currentBulkOperation {
        id
        status
        errorCode
        createdAt
        completedAt
        objectCount
        fileSize
        url
        partialDataUrl
      }
    }
  `;
  const data = await shopifyGraphQL(query);
  return data.currentBulkOperation;
}

/**
 * Writes live GoldAPI rate values to two configurable product-level metafields
 * for every product that was fetched during the sync run.
 * Only runs if the corresponding Enabled flag is set in settings.
 *
 * @param {Array}  products  - Products array returned by fetchShopifyProducts
 * @param {Object} rates     - Live gold rates from fetchLiveGoldRates
 * @param {Object} settings  - App settings from getSettings
 */
export async function updateProductGoldRateMetafields(products, rates, settings) {
  const mf1Enabled = settings.goldRateMetafield1Enabled;
  const mf2Enabled = settings.goldRateMetafield2Enabled;

  if (!mf1Enabled && !mf2Enabled) return true; // nothing to do
  if (!products || products.length === 0) return true;

  const mutation = `
    mutation UpdateProductGoldRateMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key value }
        userErrors { field message }
      }
    }
  `;

  const mf1Ns  = (settings.goldRateMetafield1Namespace || 'custom').trim();
  const mf1Key = (settings.goldRateMetafield1Key || 'gold_rate_24k').trim();
  const mf1Src = settings.goldRateMetafield1Source || 'price_gram_24k';

  const mf2Ns  = (settings.goldRateMetafield2Namespace || 'custom').trim();
  const mf2Key = (settings.goldRateMetafield2Key || 'gold_rate_18k').trim();
  const mf2Src = settings.goldRateMetafield2Source || 'price_gram_18k';

  const mf1Value = rates[mf1Src] != null ? String(rates[mf1Src]) : null;
  const mf2Value = rates[mf2Src] != null ? String(rates[mf2Src]) : null;

  if (mf1Enabled && !mf1Value) {
    console.warn(`[GoldRate MF] Source "${mf1Src}" not found in rates — skipping metafield #1`);
  }
  if (mf2Enabled && !mf2Value) {
    console.warn(`[GoldRate MF] Source "${mf2Src}" not found in rates — skipping metafield #2`);
  }

  let allMetafields = [];

  for (const product of products) {
    if (mf1Enabled && mf1Value) {
      allMetafields.push({
        ownerId: product.id,
        namespace: mf1Ns,
        key: mf1Key,
        value: mf1Value,
      });
    }
    if (mf2Enabled && mf2Value) {
      allMetafields.push({
        ownerId: product.id,
        namespace: mf2Ns,
        key: mf2Key,
        value: mf2Value,
      });
    }
  }

  if (allMetafields.length === 0) return true;

  // Shopify allows max 25 metafields per metafieldsSet call
  const CHUNK_SIZE = 25;
  for (let i = 0; i < allMetafields.length; i += CHUNK_SIZE) {
    const chunk = allMetafields.slice(i, i + CHUNK_SIZE);
    const response = await shopifyGraphQL(mutation, { metafields: chunk });
    const errors = response.metafieldsSet?.userErrors || [];
    if (errors.length > 0) {
      throw new Error(`Gold Rate Metafields Set Error: ${errors.map((e) => e.message).join(', ')}`);
    }
    await sleep(250);
  }

  console.log(`[GoldRate MF] Updated gold rate metafields for ${products.length} products.`);
  return true;
}
