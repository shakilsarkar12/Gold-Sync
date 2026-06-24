import fs from 'fs/promises';
import path from 'path';
import { MongoClient } from 'mongodb';

const DATA_DIR = path.join(process.cwd(), 'data');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const LOGS_PATH = path.join(DATA_DIR, 'logs.json');

const DEFAULT_SETTINGS = {
  shopifyShop: (process.env.SHOPIFY_SHOP_DOMAIN || '').trim(),
  shopifyAccessToken: (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '').trim(),
  goldApiKey: (process.env.GOLD_API_KEY || '').trim(),
  currency: 'INR',
  defaultKarat: '18K',
  weightNamespace: 'custom',
  weightKey: 'gold_weight',
  karatNamespace: 'custom',
  karatKey: 'gold_karat',
  diamondNamespace: 'custom',
  diamondKey: 'd_price',
  variantWeightNamespace: 'custom',
  variantWeightKey: 'gold_weight',
  variantKaratNamespace: 'custom',
  variantKaratKey: 'gold_karat',
  diamondShapeNamespace: 'custom',
  diamondShapeKey: 'diamond_shape',
  diamondCrtNamespace: 'custom',
  diamondCrtKey: 'diamond_crt',
  diamondColorNamespace: 'custom',
  diamondColorKey: 'diamond_color',
  // Product metafields to write GoldAPI values during sync
  goldRateMetafield1Enabled: false,
  goldRateMetafield1Namespace: 'custom',
  goldRateMetafield1Key: 'gold_rate_24k',
  goldRateMetafield1Source: 'price_gram_24k',
  goldRateMetafield2Enabled: false,
  goldRateMetafield2Namespace: 'custom',
  goldRateMetafield2Key: 'gold_rate_18k',
  goldRateMetafield2Source: 'price_gram_18k',
  // ── Price Breakdown Metafields (variant level) ──
  priceBreakdownEnabled: false,
  // Small diamond inputs — read from Shopify (user sets these manually in admin)
  smallDiamondGradeNamespace: 'custom',
  smallDiamondGradeKey: 'small_diamonds_grade',
  smallDiamondWeightNamespace: 'custom',
  smallDiamondWeightKey: 'small_diamonds_weight',
  smallDiamondPricePerCarat: 0,       // flat price per carat for melee/small stones
  // Breakdown output metafields (written by sync)
  bdGoldRatePerGramNamespace: 'custom',
  bdGoldRatePerGramKey: 'gold_rate_per_gram',
  bdTotalGoldValueNamespace: 'custom',
  bdTotalGoldValueKey: 'total_gold_value',
  bdCentreStoneValueNamespace: 'custom',
  bdCentreStoneValueKey: 'centre_stone_value',
  bdSmallDiamondValueNamespace: 'custom',
  bdSmallDiamondValueKey: 'small_diamonds_value',
  bdMakingChargeRateNamespace: 'custom',
  bdMakingChargeRateKey: 'making_charge_per_gram',
  bdTotalMakingNamespace: 'custom',
  bdTotalMakingKey: 'total_making_charge',
  gstPercentage: 3,
  makingChargePerGram: 0,
  makingChargeFixed: 0,
  fixedMarkup: 0,
  markupPercentage: 0,
  autoSyncEnabled: false,
  syncInterval: 5,
  timezone: 'Asia/Kolkata',
  syncTimes: ['09:00', '23:30'],
  diamondPrices: {
    round: { d: 34999, ef: 31999, gh: 29999 },
    princess: { d: 34999, ef: 31999, gh: 29999 },
    cushion: { d: 34999, ef: 31999, gh: 29999 },
    oval: { d: 34999, ef: 31999, gh: 29999 },
    emerald: { d: 34999, ef: 31999, gh: 29999 },
    portuguese: { d: 39999, ef: 36999, gh: 31999 },
    pear: { d: 34999, ef: 31999, gh: 29999 },
    asscher: { d: 34999, ef: 31999, gh: 29999 },
    heart: { d: 34999, ef: 31999, gh: 29999 },
    radiant: { d: 34999, ef: 31999, gh: 29999 },
    marquise: { d: 34999, ef: 31999, gh: 29999 },
    baguette: { d: 34999, ef: 31999, gh: 29999 },
  },
};

async function connectToDatabase() {
  const uri = process.env.DB_URI;
  if (!uri) {
    // If DB_URI is not configured, return null to fallback to local files
    return null;
  }

  try {
    if (!global._mongoClient) {
      global._mongoClient = new MongoClient(uri);
    }

    // Ensure connection is active
    try {
      await global._mongoClient.connect();
      // Test the connection
      await global._mongoClient.db('admin').command({ ping: 1 });
    } catch (e) {
      // Reconnect if topology is closed or other errors
      console.warn('MongoDB connection issue, reconnecting...', e.message);
      global._mongoClient = new MongoClient(uri);
      await global._mongoClient.connect();
      await global._mongoClient.db('admin').command({ ping: 1 });
    }

    return global._mongoClient.db('GoldSync');
  } catch (error) {
    console.error('Failed to connect to MongoDB, falling back to file storage:', error.message);
    global._mongoClient = null; // Clear the broken client so we don't reuse it
    return null;
  }
}

async function ensureDirectory() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // Ignore if directory exists
  }
}

export async function getSettings() {
  const mongoDb = await connectToDatabase();
  let saved = {};

  if (mongoDb) {
    try {
      const collection = mongoDb.collection('settings');
      const doc = await collection.findOne({ _id: 'app_settings' });
      if (doc) {
        saved = doc;
        delete saved._id; // Clean MongoDB metadata
      }
    } catch (error) {
      console.error('Failed to get settings from MongoDB:', error);
    }
  } else {
    await ensureDirectory();
    try {
      const data = await fs.readFile(SETTINGS_PATH, 'utf-8');
      saved = JSON.parse(data);
    } catch {
      // Fallback if local file does not exist
    }
  }

  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    shopifyShop: (process.env.SHOPIFY_SHOP_DOMAIN || '').trim(),
    shopifyAccessToken: (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '').trim(),
    goldApiKey: (process.env.GOLD_API_KEY || '').trim(),
  };
}

export async function saveSettings(newSettings) {
  // Clone and delete credentials to prevent them from being written to settings.json or MongoDB settings
  const persistableSettings = { ...newSettings };
  delete persistableSettings.shopifyShop;
  delete persistableSettings.shopifyAccessToken;
  delete persistableSettings.goldApiKey;

  const mongoDb = await connectToDatabase();
  if (mongoDb) {
    try {
      const collection = mongoDb.collection('settings');
      await collection.updateOne(
        { _id: 'app_settings' },
        { $set: persistableSettings },
        { upsert: true }
      );
    } catch (error) {
      console.error('Failed to save settings to MongoDB:', error);
    }
  } else {
    await ensureDirectory();
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(persistableSettings, null, 2), 'utf-8');
  }

  const currentSettings = await getSettings();
  return {
    ...currentSettings,
    ...persistableSettings,
  };
}

export async function getLogs() {
  const mongoDb = await connectToDatabase();
  if (mongoDb) {
    try {
      const collection = mongoDb.collection('logs');
      const result = await collection.find({}).sort({ timestamp: -1 }).limit(100).toArray();
      return result.map((doc) => {
        const log = { ...doc };
        delete log._id; // Clean MongoDB metadata
        return log;
      });
    } catch (error) {
      console.error('Failed to get logs from MongoDB:', error);
      return [];
    }
  }

  await ensureDirectory();
  try {
    const data = await fs.readFile(LOGS_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    await fs.writeFile(LOGS_PATH, '[]', 'utf-8');
    return [];
  }
}

export async function addLog(log) {
  const newLog = {
    ...log,
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
  };

  const mongoDb = await connectToDatabase();
  if (mongoDb) {
    try {
      const collection = mongoDb.collection('logs');
      await collection.insertOne(newLog);
      const returnLog = { ...newLog };
      delete returnLog._id;
      return returnLog;
    } catch (error) {
      console.error('Failed to add log to MongoDB:', error);
    }
  }

  await ensureDirectory();
  const logs = await getLogs();
  const updatedLogs = [newLog, ...logs].slice(0, 100);
  await fs.writeFile(LOGS_PATH, JSON.stringify(updatedLogs, null, 2), 'utf-8');
  return newLog;
}

// Store Shopify dynamic token and its update timestamp
export async function updateDynamicToken(token) {
  const tokenData = {
    shopifyDynamicToken: token,
    shopifyTokenUpdatedAt: Date.now(),
  };

  const mongoDb = await connectToDatabase();
  if (mongoDb) {
    try {
      const collection = mongoDb.collection('settings');
      await collection.updateOne(
        { _id: 'app_settings' },
        { $set: tokenData },
        { upsert: true }
      );
    } catch (error) {
      console.error('Failed to save dynamic token to MongoDB:', error);
    }
  } else {
    // Fallback to local file storage
    try {
      const current = await getSettings();
      const persistableSettings = { ...current, ...tokenData };
      delete persistableSettings.shopifyShop;
      delete persistableSettings.shopifyAccessToken;
      delete persistableSettings.goldApiKey;
      await fs.writeFile(SETTINGS_PATH, JSON.stringify(persistableSettings, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save dynamic token to file:', error);
    }
  }
}

export async function getSchedulerState() {
  const mongoDb = await connectToDatabase();
  if (mongoDb) {
    try {
      const collection = mongoDb.collection('scheduler_state');
      const doc = await collection.findOne({ _id: 'state' });
      if (doc) {
        delete doc._id;
        return doc;
      }
      return { lastSyncTime: 0 };
    } catch (error) {
      console.error('Failed to get scheduler state from MongoDB:', error);
      return { lastSyncTime: 0 };
    }
  }

  const schedulerStatePath = path.join(DATA_DIR, 'scheduler_state.json');
  try {
    const data = await fs.readFile(schedulerStatePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { lastSyncTime: 0 };
  }
}

export async function saveSchedulerState(state) {
  const mongoDb = await connectToDatabase();
  if (mongoDb) {
    try {
      const collection = mongoDb.collection('scheduler_state');
      await collection.updateOne(
        { _id: 'state' },
        { $set: state },
        { upsert: true }
      );
      return state;
    } catch (error) {
      console.error('Failed to save scheduler state to MongoDB:', error);
    }
  }

  const schedulerStatePath = path.join(DATA_DIR, 'scheduler_state.json');
  await ensureDirectory();
  await fs.writeFile(schedulerStatePath, JSON.stringify(state, null, 2), 'utf-8');
  return state;
}

export async function getSyncStatus() {
  const mongoDb = await connectToDatabase();
  if (mongoDb) {
    try {
      const collection = mongoDb.collection('sync_status');
      const doc = await collection.findOne({ _id: 'status' });
      if (doc) {
        const result = { ...doc };
        delete result._id;
        return result;
      }
      return { syncing: false, lastResult: null };
    } catch (error) {
      console.error('Failed to get sync status from MongoDB:', error);
      return { syncing: false, lastResult: null };
    }
  }
  // Fallback: use a module-level variable for local dev
  return global.__syncStatus || { syncing: false, lastResult: null };
}

export async function setSyncStatus(status) {
  const mongoDb = await connectToDatabase();
  if (mongoDb) {
    try {
      const collection = mongoDb.collection('sync_status');
      await collection.updateOne(
        { _id: 'status' },
        { $set: status },
        { upsert: true }
      );
      return status;
    } catch (error) {
      console.error('Failed to set sync status in MongoDB:', error);
    }
  }
// Fallback for local dev without DB
  global.__syncStatus = { ...global.__syncStatus, ...status };
  return status;
}

export async function getProductsCache() {
  const mongoDb = await connectToDatabase();
  if (mongoDb) {
    try {
      const collection = mongoDb.collection('products_cache');
      const doc = await collection.findOne({ _id: 'cache' });
      if (doc) {
        return { products: doc.products, timestamp: doc.timestamp };
      }
      return null;
    } catch (error) {
      console.error('Failed to get products cache from MongoDB:', error);
      return null;
    }
  }

  // Fallback
  const cachePath = path.join(DATA_DIR, 'products_cache.json');
  try {
    const data = await fs.readFile(cachePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function setProductsCache(products) {
  const cacheData = {
    products,
    timestamp: Date.now(),
  };

  const mongoDb = await connectToDatabase();
  if (mongoDb) {
    try {
      const collection = mongoDb.collection('products_cache');
      await collection.updateOne(
        { _id: 'cache' },
        { $set: cacheData },
        { upsert: true }
      );
      return true;
    } catch (error) {
      console.error('Failed to save products cache to MongoDB:', error);
      return false;
    }
  }

  // Fallback
  const cachePath = path.join(DATA_DIR, 'products_cache.json');
  await ensureDirectory();
  try {
    await fs.writeFile(cachePath, JSON.stringify(cacheData), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to write local products_cache.json:', error);
    return false;
  }
}
