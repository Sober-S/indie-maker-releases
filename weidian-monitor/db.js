 import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
 import { join, dirname } from 'path';
 import { fileURLToPath } from 'url';
 
 const __dirname = dirname(fileURLToPath(import.meta.url));
 const DATA_DIR = join(__dirname, 'data');
 const DB_PATH = join(DATA_DIR, 'products.json');
 const HISTORY_PATH = join(DATA_DIR, 'store_history.json');
 
 function ensureDataDir() {
   if (!existsSync(DATA_DIR)) {
     mkdirSync(DATA_DIR, { recursive: true });
   }
 }
 
 function loadJSON(path, fallback) {
   try {
     if (existsSync(path)) {
       return JSON.parse(readFileSync(path, 'utf-8'));
     }
   } catch (e) {
     // ignore corrupt file
   }
   return fallback;
 }
 
 function saveJSON(path, data) {
   ensureDataDir();
   writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
 }
 
 // ── Product database ──
 export function loadProducts() {
   return loadJSON(DB_PATH, []);
 }
 
 export function saveProducts(products) {
   saveJSON(DB_PATH, products);
 }
 
 export function addProduct(product) {
   const products = loadProducts();
   product._addedAt = product._addedAt || new Date().toISOString();
   product._updatedAt = new Date().toISOString();
 
   const existing = products.find(p => p.itemId === product.itemId);
   if (existing) {
     Object.assign(existing, product, { _addedAt: existing._addedAt, _updatedAt: new Date().toISOString() });
   } else {
     products.push(product);
   }
   saveProducts(products);
   return product;
 }
 
 export function addProducts(productsArray) {
   for (const p of productsArray) {
     addProduct(p);
   }
 }
 
 export function findProduct(itemId) {
   return loadProducts().find(p => p.itemId == itemId) || null;
 }
 
 export function getRecentProducts(days = 1) {
   const cutoff = Date.now() - days * 86400000;
   return loadProducts().filter(p => new Date(p._addedAt).getTime() > cutoff);
 }
 
 // ── Store history (category count tracking) ──
 export function loadStoreHistory() {
   return loadJSON(HISTORY_PATH, { snapshots: [], lastStoreInfo: null });
 }
 
 export function saveStoreSnapshot(storeInfo) {
   const history = loadStoreHistory();
   history.lastStoreInfo = storeInfo;
   history.snapshots.push({
     time: new Date().toISOString(),
     shopName: storeInfo.shopName,
     categories: storeInfo.categories,
     totalItems: storeInfo.totalItems,
     collectCount: storeInfo.collectCount
   });
   // keep last 100 snapshots
   if (history.snapshots.length > 100) history.snapshots = history.snapshots.slice(-100);
   saveJSON(HISTORY_PATH, history);
 }
 
 export function getLastSnapshot() {
   const history = loadStoreHistory();
   return history.snapshots.length > 0 ? history.snapshots[history.snapshots.length - 1] : null;
 }
 
 export function getLastStoreInfo() {
   return loadStoreHistory().lastStoreInfo || null;
 }
 
 export function listAllProducts() {
   return loadProducts();
 }
 
 // ── Printer helpers ──
 const BOLD = '\x1b[1m';
 const GREEN = '\x1b[32m';
 const YELLOW = '\x1b[33m';
 const CYAN = '\x1b[36m';
 const RED = '\x1b[31m';
 const DIM = '\x1b[2m';
 const RESET = '\x1b[0m';
 
 export function printInfo(label, value) {
   console.log(`  ${DIM}${label}:${RESET} ${value || '—'}`);
 }
 
 export { BOLD, GREEN, YELLOW, CYAN, RED, DIM, RESET };
