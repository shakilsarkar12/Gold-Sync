const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());

const { runProductSync } = require('./src/lib/sync.js');

async function test() {
  console.log('Running sync...');
  await runProductSync(false);
  console.log('Sync done.');
}

test().catch(console.error);
