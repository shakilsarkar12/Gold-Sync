import { getSettings } from './src/lib/db.js';

async function test() {
  const settings = await getSettings();
  const shop = settings.shopifyShop;
  const token = settings.shopifyDynamicToken || settings.shopifyAccessToken;

  const url = `https://${shop.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/admin/api/2024-04/graphql.json`;

  const query = `
    mutation {
      stagedUploadsCreate(input: [{
        resource: BULK_MUTATION_VARIABLES,
        filename: "test.jsonl",
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

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const data = await response.json();
  const target = data.data.stagedUploadsCreate.stagedTargets[0];
  console.log("Staged Target:", target.url);
  
  const jsonl = `{"productId": "gid://shopify/Product/123", "variants": [{"id": "gid://shopify/ProductVariant/456", "price": "100.00"}]}\n`;
  const formData = new FormData();
  for (const param of target.parameters) {
    formData.append(param.name, param.value);
  }
  formData.append('file', new Blob([jsonl], { type: 'text/jsonl' }), 'test.jsonl');
  
  const uploadRes = await fetch(target.url, {
    method: 'POST',
    body: formData,
  });
  console.log("Upload Status:", uploadRes.status);
  const uploadText = await uploadRes.text();
  console.log("Upload Result:", uploadText);
}

test().catch(console.error);
