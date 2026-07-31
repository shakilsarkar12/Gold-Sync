import fs from 'fs/promises';
import path from 'path';
import mysql from 'mysql2/promise';

const DATA_DIR = path.join(process.cwd(), 'data');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const LOGS_PATH = path.join(DATA_DIR, 'logs.json');

const DEFAULT_SETTINGS = {
  shopifyShop: (process.env.SHOPIFY_SHOP_DOMAIN || '').trim(),
  shopifyAccessToken: (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '').trim(),
  currency: 'INR',
  defaultKarat: '18K',
  weightNamespace: 'custom',
  weightKey: 'gold_weight',
  karatNamespace: 'custom',
  karatKey: 'gold_karat',
  diamondNamespace: 'custom',
  diamondKey: 'd_price',
  dPricePerCtNamespace: 'custom',
  dPricePerCtKey: 'd_price',
  efPricePerCtNamespace: 'custom',
  efPricePerCtKey: 'e_f_price',
  ghPricePerCtNamespace: 'custom',
  ghPricePerCtKey: 'g_h_price',
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
  goldRateMetafield1Enabled: false,
  goldRateMetafield1Namespace: 'custom',
  goldRateMetafield1Key: 'gold_rate_24k',
  goldRateMetafield1Source: 'price_gram_24k',
  goldRateMetafield2Enabled: false,
  goldRateMetafield2Namespace: 'custom',
  goldRateMetafield2Key: 'gold_rate_18k',
  goldRateMetafield2Source: 'price_gram_18k',
  priceBreakdownEnabled: false,
  smallDiamondGradeNamespace: 'custom',
  smallDiamondGradeKey: 'small_diamonds_grade',
  smallDiamondWeightNamespace: 'custom',
  smallDiamondWeightKey: 'small_diamonds_weight',
  smallDiamondPricePerCarat: 0,
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

let mysqlPool = global.__mysqlPool || null;
let dbInitialized = global.__dbInitialized || false;

async function getMysqlPool() {
  // If MySQL hit max_connections_per_hour error recently, temporarily use local fallback for 60 seconds
  if (global.__mysqlDisabledUntil && Date.now() < global.__mysqlDisabledUntil) {
    return null;
  }

  const host = process.env.MYSQL_HOST;
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DATABASE;

  if (!host || !user || !database) {
    return null;
  }

  if (!mysqlPool) {
    try {
      mysqlPool = mysql.createPool({
        host,
        user,
        password,
        database,
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        connectTimeout: 10000,
      });

      // Test connection
      await mysqlPool.query('SELECT 1');
      global.__mysqlPool = mysqlPool;
    } catch (error) {
      console.error('Failed to connect to MySQL:', error.message);
      if (error.message && (error.message.includes('max_connections_per_hour') || error.code === 'ER_USER_LIMIT_REACHED')) {
        console.warn('[DB] MySQL connection limit per hour reached. Temporarily switching to in-memory/file storage for 60s.');
        global.__mysqlDisabledUntil = Date.now() + 60000;
      }
      mysqlPool = null;
      global.__mysqlPool = null;
      return null;
    }
  }

  if (mysqlPool && !dbInitialized) {
    try {
      await mysqlPool.query(`
        CREATE TABLE IF NOT EXISTS gold_sync_store (
          collection VARCHAR(50) NOT NULL,
          doc_id VARCHAR(100) NOT NULL,
          data JSON NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (collection, doc_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      dbInitialized = true;
      global.__dbInitialized = true;
    } catch (err) {
      console.error('Failed to initialize MySQL table:', err.message);
    }
  }

  return mysqlPool;
}

// Helper for NoSQL-like operations in MySQL with auto-reconnect retry
async function getDoc(collection, doc_id, isRetry = false) {
  const pool = await getMysqlPool();
  if (!pool) return null;
  try {
    const [rows] = await pool.query(
      'SELECT data FROM gold_sync_store WHERE collection = ? AND doc_id = ?',
      [collection, doc_id]
    );
    if (rows.length > 0) {
      let data = rows[0].data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {
          // ignore
        }
      }
      return data;
    }
  } catch (error) {
    if ((error.code === 'ECONNRESET' || error.code === 'PROTOCOL_CONNECTION_LOST') && !isRetry) {
      mysqlPool = null;
      return getDoc(collection, doc_id, true);
    }
    console.error(`MySQL getDoc error (${collection}/${doc_id}):`, error.message);
  }
  return null;
}

async function setDoc(collection, doc_id, data, isRetry = false) {
  const pool = await getMysqlPool();
  if (!pool) return false;
  try {
    await pool.query(
      `INSERT INTO gold_sync_store (collection, doc_id, data) 
       VALUES (?, ?, ?) 
       ON DUPLICATE KEY UPDATE data = VALUES(data)`,
      [collection, doc_id, JSON.stringify(data)]
    );
    return true;
  } catch (error) {
    if ((error.code === 'ECONNRESET' || error.code === 'PROTOCOL_CONNECTION_LOST') && !isRetry) {
      mysqlPool = null;
      return setDoc(collection, doc_id, data, true);
    }
    console.error(`MySQL setDoc error (${collection}/${doc_id}):`, error.message);
    return false;
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
  let saved = {};
  const pool = await getMysqlPool();
  
  if (pool) {
    const doc = await getDoc('settings', 'app_settings');
    if (doc) saved = doc;
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
  };
}

export async function saveSettings(newSettings) {
  const persistableSettings = { ...newSettings };
  delete persistableSettings.shopifyShop;
  delete persistableSettings.shopifyAccessToken;

  const pool = await getMysqlPool();
  if (pool) {
    await setDoc('settings', 'app_settings', persistableSettings);
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
  const pool = await getMysqlPool();
  if (pool) {
    try {
      const [rows] = await pool.query(
        'SELECT data FROM gold_sync_store WHERE collection = ? ORDER BY updated_at DESC LIMIT 100',
        ['logs']
      );
      return rows.map(row => {
        let d = row.data;
        if (typeof d === 'string') {
          try { d = JSON.parse(d); } catch (e) {}
        }
        return d;
      });
    } catch (error) {
      console.error('MySQL getLogs error:', error.message);
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

  const pool = await getMysqlPool();
  if (pool) {
    await setDoc('logs', newLog.id, newLog);
    return newLog;
  }

  await ensureDirectory();
  const logs = await getLogs();
  const updatedLogs = [newLog, ...logs].slice(0, 100);
  await fs.writeFile(LOGS_PATH, JSON.stringify(updatedLogs, null, 2), 'utf-8');
  return newLog;
}

export async function updateDynamicToken(token) {
  const tokenData = {
    shopifyDynamicToken: token,
    shopifyTokenUpdatedAt: Date.now(),
  };

  const pool = await getMysqlPool();
  if (pool) {
    const current = await getDoc('settings', 'app_settings') || {};
    await setDoc('settings', 'app_settings', { ...current, ...tokenData });
  } else {
    try {
      const current = await getSettings();
      const persistableSettings = { ...current, ...tokenData };
      delete persistableSettings.shopifyShop;
      delete persistableSettings.shopifyAccessToken;
      await fs.writeFile(SETTINGS_PATH, JSON.stringify(persistableSettings, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save dynamic token to file:', error);
    }
  }
}

export async function getSchedulerState() {
  const pool = await getMysqlPool();
  if (pool) {
    const doc = await getDoc('scheduler_state', 'state');
    if (doc) return doc;
    return { lastSyncTime: 0 };
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
  const pool = await getMysqlPool();
  if (pool) {
    await setDoc('scheduler_state', 'state', state);
    return state;
  }

  const schedulerStatePath = path.join(DATA_DIR, 'scheduler_state.json');
  await ensureDirectory();
  await fs.writeFile(schedulerStatePath, JSON.stringify(state, null, 2), 'utf-8');
  return state;
}

export async function getSyncStatus() {
  if (global.__syncStatus) {
    return global.__syncStatus;
  }
  const pool = await getMysqlPool();
  if (pool) {
    const doc = await getDoc('sync_status', 'status');
    if (doc) {
      global.__syncStatus = doc;
      return doc;
    }
  }
  return global.__syncStatus || { syncing: false, lastResult: null };
}

export async function setSyncStatus(status) {
  global.__syncStatus = { ...(global.__syncStatus || {}), ...status };
  const pool = await getMysqlPool();
  if (pool) {
    await setDoc('sync_status', 'status', global.__syncStatus);
  }
  return global.__syncStatus;
}

export async function getMakingChargeStatus() {
  if (global.__makingChargeStatus) {
    return global.__makingChargeStatus;
  }
  const pool = await getMysqlPool();
  if (pool) {
    const doc = await getDoc('sync_status', 'making_charge_status');
    if (doc) {
      global.__makingChargeStatus = doc;
      return doc;
    }
  }
  return global.__makingChargeStatus || { syncing: false, completedItems: 0, totalItems: 0, message: '' };
}

export async function setMakingChargeStatus(status) {
  global.__makingChargeStatus = { ...(global.__makingChargeStatus || {}), ...status };
  const pool = await getMysqlPool();
  if (pool) {
    await setDoc('sync_status', 'making_charge_status', global.__makingChargeStatus);
  }
  return global.__makingChargeStatus;
}

export async function getProductsCache() {
  const pool = await getMysqlPool();
  if (pool) {
    return await getDoc('products_cache', 'cache');
  }

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

  const pool = await getMysqlPool();
  if (pool) {
    return await setDoc('products_cache', 'cache', cacheData);
  }

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

export async function getSavedGoldRates() {
  const pool = await getMysqlPool();
  if (pool) {
    return await getDoc('gold_rates', 'rates');
  }

  const cachePath = path.join(DATA_DIR, 'gold_rates.json');
  try {
    const data = await fs.readFile(cachePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function saveGoldRates(rates) {
  const pool = await getMysqlPool();
  if (pool) {
    return await setDoc('gold_rates', 'rates', rates);
  }

  const cachePath = path.join(DATA_DIR, 'gold_rates.json');
  await ensureDirectory();
  try {
    await fs.writeFile(cachePath, JSON.stringify(rates), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to write local gold_rates.json:', error);
    return false;
  }
}
