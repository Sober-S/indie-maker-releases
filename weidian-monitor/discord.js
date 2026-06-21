 /**
  * Discord Webhook 推送模块
  * 直接用 HTTP 请求，不需要 discord.js 依赖
  */
 import https from 'https';
 import { URL } from 'url';
 import { readFileSync, writeFileSync, existsSync } from 'fs';
 import { join, dirname } from 'path';
 import { fileURLToPath } from 'url';
 
 const __dirname = dirname(fileURLToPath(import.meta.url));
 const CONFIG_PATH = join(__dirname, 'data', 'config.json');
 
 const EMBED_COLORS = {
   NEW: 0x57F287,      // green - new product
   HEADER: 0x5865F2,   // blurple - header
   STORE: 0xFEE75C,    // yellow - store info
   WARN: 0xF23F43      // red - warning
 };
 
 // ── Config management ──
 export function loadConfig() {
   try {
     if (existsSync(CONFIG_PATH)) {
       return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
     }
   } catch { /* ignore */ }
   return {};
 }
 
 export function saveConfig(config) {
   const dir = join(__dirname, 'data');
   if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
   writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
 }
 
 export function getWebhookUrl() {
   // Priority: env var > config file
   if (process.env.DISCORD_WEBHOOK_URL) return process.env.DISCORD_WEBHOOK_URL;
   const config = loadConfig();
   return config.discordWebhookUrl || '';
 }
 
 export function setWebhookUrl(url) {
   const config = loadConfig();
   config.discordWebhookUrl = url;
   saveConfig(config);
 }
 
 // ── HTTP POST to Discord ──
 function postToDiscord(webhookUrl, payload) {
   return new Promise((resolve, reject) => {
     const url = new URL(webhookUrl);
     const body = JSON.stringify(payload);
     const options = {
       hostname: url.hostname,
       port: 443,
       path: url.pathname + url.search,
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Content-Length': Buffer.byteLength(body)
       }
     };
     const req = https.request(options, (res) => {
       let data = '';
       res.on('data', (c) => data += c);
       res.on('end', () => resolve({ status: res.statusCode, body: data }));
     });
     req.on('error', reject);
     req.on('timeout', () => { req.destroy(); reject(new Error('Discord timeout')); });
     req.write(body);
     req.end();
   });
 }
 
 // ── Build embeds from product data ──
 export function buildDiscordPayload(reportData) {
   const embeds = [];
   const today = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric' });
 
   // Header embed
   embeds.push({
     title: '📊 微店上新日报',
     description: `**${today}** · 共追踪 ${reportData.totalTracked || 0} 件商品`,
     color: EMBED_COLORS.HEADER,
     footer: { text: 'Weidian Monitor · 自动推送' }
   });
 
   // New products
   const newItems = reportData.newProducts || [];
   if (newItems.length > 0) {
     embeds.push({
       title: `🆕 今日上新 (${newItems.length})`,
       color: EMBED_COLORS.NEW,
       fields: newItems.map((p, i) => ({
         name: `${p.shopName || ''} | ${p.name || '未命名'}`,
         value: [
           p.price ? `**¥${p.price}**` : '',
           p._note ? `> ${p._note}` : '',
           `[🔗 查看商品](https://weidian.com/item.html?itemID=${p.itemId})`
         ].filter(Boolean).join('\n'),
         inline: false
       }))
     });
 
     // Image embeds (one per new product, first image)
     for (const p of newItems) {
       if (p.images && p.images.length > 0) {
         embeds.push({
           color: EMBED_COLORS.NEW,
           image: { url: p.images[0] }
         });
       }
     }
   } else {
     embeds.push({
       title: '🆕 今日上新',
       description: '今日暂无新增商品。',
       color: EMBED_COLORS.NEW
     });
   }
 
   // Store overview
   if (reportData.stores && reportData.stores.length > 0) {
     const activeStores = reportData.stores.filter(s => s.totalItems > 0);
     const storeLines = activeStores.map(s =>
       `• **${s.name}** — ${s.totalItems} 件${s.collectCount ? ` (👥 ${(s.collectCount/10000).toFixed(1)}万)` : ''}`
     );
     if (storeLines.length > 0) {
       embeds.push({
         title: `🏪 店铺概览 (${activeStores.length}/${reportData.stores.length} 有货)`,
         description: storeLines.join('\n'),
         color: EMBED_COLORS.STORE
       });
     }
   }
 
   return { embeds };
 }
 
 // ── Parse report markdown into structured data ──
 export function parseReportToData(reportMarkdown) {
   const data = { newProducts: [], stores: [], totalTracked: 0 };
   const lines = reportMarkdown.split('\n');
 
   let currentSection = '';
   let currentProduct = null;
 
   for (const line of lines) {
     if (line.startsWith('## 今日上新')) {
       currentSection = 'new';
       continue;
     }
     if (line.startsWith('## 🏪 店铺追踪概览') || line.startsWith('## 店铺追踪概览')) {
       currentSection = 'stores';
       continue;
     }
     if (line.startsWith('## 📦 全部追踪商品') || line.startsWith('## 全部追踪商品')) {
       currentSection = 'all';
       continue;
     }
 
     if (currentSection === 'new') {
       // Match product line: **ShopName** | **ProductName** | **¥Price**
       const productMatch = line.match(/\*\*([^*]+)\*\*\s*\|\s*\*\*([^*]+)\*\*\s*(?:\|\s*\*\*¥?([\d.]+)\*\*)?/);
       if (productMatch) {
         if (currentProduct) data.newProducts.push(currentProduct);
         currentProduct = {
           shopName: productMatch[1].trim(),
           name: productMatch[2].trim(),
           price: parseFloat(productMatch[3]) || 0,
           images: []
         };
         continue;
       }
 
       // Match note line: > note text
       const noteMatch = line.match(/^>\s*(.+)/);
       if (noteMatch && currentProduct) {
         currentProduct._note = noteMatch[1].trim();
         continue;
       }
 
       // Match image line: ![alt](url)
       const imgMatch = line.match(/!\[.*?\]\(([^)]+)\)/);
       if (imgMatch && currentProduct) {
         currentProduct.images.push(imgMatch[1]);
         continue;
       }
 
       // Match link line
       const linkMatch = line.match(/🔗\s*\[([^\]]+)\]\(([^)]+)\)/);
       if (linkMatch && currentProduct) {
         currentProduct.link = linkMatch[2];
         continue;
       }
 
       // End of product section (--- separator)
       if (line.trim() === '---' && currentProduct) {
         data.newProducts.push(currentProduct);
         currentProduct = null;
       }
     }
 
     if (currentSection === 'stores') {
       // Match store table rows: | StoreName | value |
       const tableMatch = line.match(/^\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/);
       if (tableMatch) {
         const key = tableMatch[1].trim();
         const val = tableMatch[2].trim();
         if (key === '店铺') {
           // Already handled
         } else if (key === '关注') {
           if (data.stores.length > 0) {
             data.stores[data.stores.length - 1].collectCount = parseInt(val.replace(/,/g, '')) || 0;
           }
         } else if (key === '在售') {
           if (data.stores.length > 0) {
             data.stores[data.stores.length - 1].totalItems = parseInt(val) || 0;
           }
         }
       }
     }
 
     if (currentSection === 'all') {
       const allMatch = line.match(/^- \[([^\]]+)\]\(([^)]+)\)\s*¥?([\d.]+)?/);
       if (allMatch) {
         data.totalTracked++;
       }
     }
   }
 
   // Push last product
   if (currentProduct) data.newProducts.push(currentProduct);
 
   // If no store data from report, try to get from DB
   if (data.stores.length === 0) {
  const { getLastStoreInfo } = require('./db.js');
   const { getLastStoreInfo } = await import('./db.js');
   const info = getLastStoreInfo();
     if (info) {
       data.stores.push({
         name: info.shopName,
         totalItems: info.totalItems || 0,
         collectCount: info.collectCount || 0
       });
     }
   }
 
   return data;
 }
 
 // ── Main push function ──
 export async function pushToDiscord(webhookUrl, reportMarkdown) {
   if (!webhookUrl) {
     throw new Error('未配置 Discord Webhook URL\n' +
       '设置方式:\n' +
       '  1. export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."\n' +
       '  2. node monitor.js config webhook <url>');
   }
 
   const reportData = parseReportToData(reportMarkdown);
 
   // Add totalTracked from all products
   const { listAllProducts } = await import('./db.js');
   reportData.totalTracked = listAllProducts().length;
 
   // Add store info from DB if not in report
   if (reportData.stores.length === 0) {
     const { loadStoreHistory } = await import('./db.js');
     const history = loadStoreHistory();
     if (history.lastStoreInfo) {
       reportData.stores.push(history.lastStoreInfo);
     }
   }
 
   const payload = buildDiscordPayload(reportData);
   const result = await postToDiscord(webhookUrl, payload);
 
   if (result.status !== 204 && result.status !== 200) {
     throw new Error(`Discord 返回 ${result.status}: ${result.body.slice(0, 200)}`);
   }
 
   return result;
 }
