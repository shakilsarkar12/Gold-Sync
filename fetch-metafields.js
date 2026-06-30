const { MongoClient } = require('mongodb');

async function run() {
  const uri = 'mongodb+srv://AZURI_783:kQZeyfmGpw62fKh7@cluster0.m2ljyhc.mongodb.net/?appName=Cluster0';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  
  const settings = await db.collection('settings').findOne({});
  const token = settings.shopifyAccessToken;
  const shop = settings.shopifyShop;
  
  const query = `
    {
      metafieldDefinitions(first: 50, ownerType: PRODUCT) {
        nodes {
          namespace
          key
          name
          type {
            name
          }
        }
      }
    }
  `;
  
  const res = await fetch(`https://${shop}/admin/api/2023-10/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token
    },
    body: JSON.stringify({ query })
  });
  
  const data = await res.json();
  console.log(JSON.stringify(data.data.metafieldDefinitions.nodes.filter(n => n.key.includes('gold_rate')), null, 2));
  
  client.close();
}

run().catch(console.error);
