const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());

const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const shop = process.env.SHOPIFY_SHOP_DOMAIN;
const endpoint = `https://${shop}/admin/api/2023-10/graphql.json`;

async function fetchGraphQL(query, variables = {}) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function run() {
  const query = `{ products(first: 1) { nodes { id } } }`;
  const res = await fetchGraphQL(query);
  const productId = res.data.products.nodes[0].id;
  
  const mutation = `
    mutation UpdateProductGoldRateMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key value type }
        userErrors { field message }
      }
    }
  `;
  const payload = {
    metafields: [
      {
        ownerId: productId,
        namespace: 'custom',
        key: 'gold_rate_14k',
        value: '4500.50',
        type: 'number_decimal'
      }
    ]
  };
  console.log('Testing number_decimal...');
  const res1 = await fetchGraphQL(mutation, payload);
  console.log(JSON.stringify(res1.data.metafieldsSet.userErrors, null, 2));
  
  payload.metafields[0].type = 'single_line_text_field';
  console.log('Testing single_line_text_field...');
  const res2 = await fetchGraphQL(mutation, payload);
  console.log(JSON.stringify(res2.data.metafieldsSet.userErrors, null, 2));
}

run().catch(console.error);
