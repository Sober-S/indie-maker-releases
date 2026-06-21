 /**
  * 全自动 Chrome 扫描脚本 — 扫描所有卖家店铺，提取商品信息
  * 通过 Codex Chrome MCP 运行
  */
 
 import SELLERS from './sellers.js';
 import { addProduct, findProduct, saveStoreSnapshot, loadProducts, loadStoreHistory, listAllProducts } from './db.js';
 import { parseStorePage } from './store-parser.js';
 import { fetchStorePage } from './scraper.js';
 
 // ── 扫描单个店铺 ──
 export async function scanStore(tab, seller) {
   const url = `https://weidian.com/?userid=${seller.userId}`;
   console.log(`\n📡 正在扫描: ${seller.name} (${seller.userId})`);
   
   await tab.goto(url);
   await tab.playwright.waitForTimeout(4000);
 
   // 提取店铺信息和商品数据
   const result = await tab.playwright.evaluate(() => {
     const output = { shopName: '', products: [] };
 
     // Try to get shop name
     const title = document.querySelector('title');
     if (title) output.shopName = title.textContent?.trim() || '';
 
     // Find product items
     const items = document.querySelectorAll('div.item');
     for (const item of items) {
       const text = item.textContent?.trim() || '';
 
       // Skip non-product items
       if (!text || text.includes('万能补邮费') || text.includes('换货')) continue;
 
       // Extract name (everything before the first price pattern)
       const priceMatch = text.match(/￥(\d+)(\.(\d+))?/);
       const price = priceMatch ? '¥' + priceMatch[1] + (priceMatch[2] || '') : '';
       const name = priceMatch ? text.slice(0, priceMatch.index).trim() : text.slice(0, 100).trim();
 
       // Determine tag (上新/预售)
       let tag = '在售';
       if (name.includes('预售')) tag = '预售';
       else if (name.includes('上新')) tag = '上新';
 
       // Get image URL
       const img = item.querySelector('img');
       const imgSrc = img ? (img.src || img.getAttribute('data-src') || '') : '';
 
       output.products.push({ name, price, tag, imgSrc: imgSrc?.split('?')[0] || '' });
     }
 
     return output;
   });
 
   // 获取商品 ID — 需要点击每个商品获取
   const items = result.products;
   if (items.length === 0) {
     console.log(`  ⚠️ 未找到商品 (可能已关闭或需要登录)`);
     return { seller, shopName: result.shopName, products: [], newProducts: [] };
   }
 
   console.log(`  找到 ${items.length} 件商品，正在获取详情...`);
 
   const fullProducts = [];
   for (let i = 0; i < items.length; i++) {
     try {
       const productCard = tab.playwright.locator('div.item').nth(i);
       await tab.playwright.expectNavigation(
         () => productCard.click(),
         { timeoutMs: 10000 }
       );
 
       const pageUrl = await tab.url();
       const itemId = pageUrl.match(/itemID=(\d+)/)?.[1] || '';
       const cleanUrl = `https://weidian.com/item.html?itemID=${itemId}`;
 
       const product = {
         itemId,
         name: items[i].name,
         price: parseFloat(items[i].price.replace('¥', '')) || 0,
         shopName: result.shopName || seller.name,
         shopId: seller.userId,
         images: items[i].imgSrc ? [items[i].imgSrc] : [],
         url: cleanUrl,
         _tag: items[i].tag,
         _note: `${seller.name} | ${items[i].tag}`
       };
 
       fullProducts.push(product);
 
       // Go back to store page
       if (i < items.length - 1) {
         await tab.playwright.waitForTimeout(500);
         await tab.go("https://weidian.com/?userid=" + seller.userId);
         await tab.playwright.waitForTimeout(3000);
       }
     } catch (e) {
       console.log(`  ⚠️ 第 ${i+1} 件商品获取失败: ${e.message?.slice(0, 60)}`);
       // Try to navigate back
       try { await tab.go("https://weidian.com/?userid=" + seller.userId); } catch {}
     }
   }
 
   // 检测新品
   const existing = listAllProducts();
   const existingIds = new Set(existing.map(p => p.itemId));
   const newProducts = fullProducts.filter(p => !existingIds.has(p.itemId));
 
   // 保存到数据库
   for (const p of fullProducts) {
     addProduct(p);
   }
 
   if (newProducts.length > 0) {
     console.log(`  🆕 新品 (${newProducts.length}):`);
     for (const p of newProducts) {
       console.log(`    • ${p.name} — ¥${p.price}`);
     }
   } else {
     console.log(`  ✅ 无新品`);
   }
 
   return {
     seller,
     shopName: result.shopName,
     products: fullProducts,
     newProducts
   };
 }
 
 // ── 扫描所有店铺 ──
 export async function scanAllStores(tab, sellers) {
   const results = [];
   let totalNew = 0;
   let totalProducts = 0;
 
   for (const seller of sellers) {
     try {
       const result = await scanStore(tab, seller);
       results.push(result);
       totalNew += result.newProducts.length;
       totalProducts += result.products.length;
     } catch (e) {
       console.log(`\n❌ ${seller.name} 扫描失败: ${e.message?.slice(0, 80)}`);
       results.push({ seller, error: e.message, products: [], newProducts: [] });
     }
 
     // 小延迟避免被限流
     await tab.playwright.waitForTimeout(1000);
   }
 
   return { results, totalNew, totalProducts };
 }
 
 // ── 生成扫描报告 ──
 export function printScanSummary(results) {
   const { results: scanResults, totalNew, totalProducts } = results;
   const activeStores = scanResults.filter(r => r.products.length > 0);
   const storesWithNew = scanResults.filter(r => r.newProducts.length > 0);
 
   console.log(`\n${'='.repeat(50)}`);
   console.log(`📊 扫描完成！`);
   console.log(`  共扫描: ${scanResults.length} 个卖家`);
   console.log(`  有货: ${activeStores.length} 个`);
   console.log(`  总商品: ${totalProducts} 件`);
   console.log(`  今日新品: ${totalNew} 件`);
 
   if (storesWithNew.length > 0) {
     console.log(`\n🆕 新品店铺:`);
     for (const s of storesWithNew) {
       console.log(`  • ${s.seller.name} — ${s.newProducts.length} 件新品`);
       for (const p of s.newProducts) {
         console.log(`    - ${p.name} (¥${p.price})`);
       }
     }
   }
 
   if (activeStores.length > 0) {
     console.log(`\n📦 在售商品总数:`);
     for (const s of activeStores) {
       console.log(`  • ${s.seller.name}: ${s.products.length} 件`);
     }
   }
   console.log(`${'='.repeat(50)}`);
 }
