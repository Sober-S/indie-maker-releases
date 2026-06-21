 /**
  * Daily report generator.
  */
 import {
   loadProducts, getLastSnapshot, getLastStoreInfo, loadStoreHistory,
   BOLD, GREEN, YELLOW, CYAN, DIM, RESET, RED
 } from './db.js';
 
 export function generateDailyReport(opts = {}) {
   const products = loadProducts();
   const storeInfo = getLastStoreInfo();
   const history = loadStoreHistory();
   const today = new Date().toISOString().slice(0, 10);
   const lines = [];
 
   function add(l) { lines.push(l); }
   function addBlank() { lines.push(''); }
 
   // ── Header ──
   add(`# 📊 微店上新日报 — ${today}`);
   addBlank();
   add(`> ⌚ 生成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
   addBlank();
   add(`---`);
   addBlank();
 
   // ── New Products (added today) ──
   const todayStart = new Date();
   todayStart.setHours(0, 0, 0, 0);
   const newProducts = products.filter(p => new Date(p._addedAt).getTime() >= todayStart.getTime());
 
   if (newProducts.length === 0) {
     add(`## 今日无上新`);
     addBlank();
     add(`目前追踪了 ${products.length} 件商品，今日暂无新增。`);
     addBlank();
   } else {
     add(`## 今日上新 (${newProducts.length})`);
     addBlank();
 
     for (const p of newProducts) {
       // Brand & Product line like: **JUDX | Stone Island Zip Hoodie | ¥228**
       const storeTag = p.shopName ? `**${p.shopName}**` : '';
       const nameTag = p.name ? `**${p.name}**` : `**商品ID: ${p.itemId}**`;
       const priceTag = p.price ? `**¥${p.price}**` : '';
       add(`${storeTag} | ${nameTag} ${priceTag ? `| ${priceTag}` : ''}`);
       addBlank();
 
       // Seller note if any
       if (p._note) {
         add(`> ${p._note}`);
         addBlank();
       }
 
       // Images (up to 3)
       if (p.images && p.images.length > 0) {
         for (const img of p.images.slice(0, 3)) {
           add(`![商品图](${img})`);
         }
         if (p.images.length > 3) {
           add(`*共 ${p.images.length} 张图片*`);
         }
         addBlank();
       }
 
       // Link
       const itemUrl = `https://weidian.com/item.html?itemID=${p.itemId}`;
       add(`🔗 [查看商品](${itemUrl})`);
       addBlank();
 
       // Separator between products
       add(`---`);
       addBlank();
     }
   }
 
   // ── Store Summary ──
   if (storeInfo) {
     add(`## 🏪 店铺追踪概览`);
     addBlank();
     add(`| 项目 | 内容 |`);
     add(`|------|------|`);
     add(`| 店铺 | ${storeInfo.shopName} |`);
     if (storeInfo.collectCount) add(`| 关注 | ${storeInfo.collectCount.toLocaleString()} |`);
     if (storeInfo.totalItems != null) add(`| 在售 | ${storeInfo.totalItems} 件 |`);
     addBlank();
 
     // Categories
     if (storeInfo.categories?.length > 0) {
       add(`| 分类 | 数量 |`);
       add(`|------|------|`);
       for (const c of storeInfo.categories) {
         add(`| ${c.name} | ${c.itemCount} |`);
       }
       addBlank();
     }
 
     // Compare with last snapshot
     const lastSnap = getLastSnapshot();
     if (lastSnap?.categories) {
       const changes = [];
       for (const nc of storeInfo.categories) {
         const oc = lastSnap.categories.find(c => c.name === nc.name);
         if (!oc || oc.itemCount !== nc.itemCount) {
           const delta = nc.itemCount - (oc?.itemCount || 0);
           if (delta !== 0) changes.push({ name: nc.name, from: oc?.itemCount || 0, to: nc.itemCount, delta });
         }
       }
       if (changes.length > 0) {
         add(`**📊 数量变动**`);
         for (const c of changes) {
           const sign = c.delta > 0 ? `📈 +${c.delta}` : `📉 ${c.delta}`;
           add(`- ${c.name}: ${c.from} → ${c.to} ${sign}`);
         }
         addBlank();
       }
     }
   }
 
   // ── All tracked products summary ──
   if (products.length > 0) {
     add(`## 📦 全部追踪商品 (${products.length})`);
     addBlank();
     const sorted = [...products].sort((a, b) => new Date(b._addedAt) - new Date(a._addedAt));
     for (const p of sorted) {
       const date = p._addedAt ? new Date(p._addedAt).toLocaleDateString('zh-CN') : '—';
       const price = p.price ? `¥${p.price}` : '';
       const name = p.name || `ID:${p.itemId}`;
       const itemUrl = `https://weidian.com/item.html?itemID=${p.itemId}`;
       add(`- [${name}](${itemUrl}) ${price} \`${date}\``);
     }
     addBlank();
   }
 
   add(`---`);
   add(`*Weidian Monitor · 自动追踪*`);
 
   return lines.join('\n');
 }
 
 export function printReportToConsole(reportMarkdown) {
   // Simple console version - strip markdown formatting for terminal
   const lines = reportMarkdown.split('\n');
   for (const line of lines) {
     if (line.startsWith('# ')) {
       console.log(`\n${BOLD}${CYAN}${line.replace(/^#\s*/, '').trim()}${RESET}`);
     } else if (line.startsWith('## ')) {
       console.log(`\n${BOLD}${GREEN}${line.replace(/^##\s*/, '')}${RESET}`);
     } else if (line.startsWith('### ')) {
       console.log(`\n${YELLOW}${line.replace(/^###\s*/, '')}${RESET}`);
     } else if (line.startsWith('|')) {
       console.log(line);
     } else if (line.trim()) {
       console.log(`  ${line}`);
     }
   }
 }
