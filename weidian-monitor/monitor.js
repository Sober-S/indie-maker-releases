 /**
  * Weidian Monitor — 微店卖家新品监控与日报生成
  *
  * Usage:
  *   node monitor.js store <userId>    — 抓取店铺概览，追踪商品数量变化
  *   node monitor.js add <itemUrl>     — 添加单个商品追踪
  *   node monitor.js report            — 生成日报
  *   node monitor.js list              — 列出所有追踪商品
  *   node monitor.js check             — 执行完整检查（store + report）
  */
 
 import { existsSync, writeFileSync, mkdirSync } from 'fs';
 import { join, dirname } from 'path';
 import { fileURLToPath } from 'url';
 import { parseStorePage, formatCategoryDiff } from './store-parser.js';
 import { parseItemPage, extractItemIdFromUrl } from './item-parser.js';
 import { fetchStorePage, fetchItemPage } from './scraper.js';
 import {
   loadProducts, saveProducts, addProduct, findProduct, getRecentProducts,
   saveStoreSnapshot, getLastSnapshot, getLastStoreInfo,
   loadStoreHistory, listAllProducts,
   BOLD, GREEN, YELLOW, CYAN, DIM, RESET, RED
 } from './db.js';
 import { generateDailyReport } from './report.js';
import SELLERS, { findSeller } from './sellers.js';
 
 const __dirname = dirname(fileURLToPath(import.meta.url));
 
 // ── Default sellers ──
 const DEFAULT_SELLERS = [
   { name: 'Cola出品', userId: '1785487515' }
 ];
 
 function printHelp() {
   console.log(`
 ${BOLD}Weidian Monitor — 微店卖家新品监控${RESET}
 
 ${CYAN}用法${RESET}
   node monitor.js store [name|id]       抓取店铺概览
   node monitor.js store all             抓取所有卖家概览
   node monitor.js add <url|id> [备注]     添加商品追踪
   node monitor.js report                 生成日报
   node monitor.js list                   列出追踪商品
   node monitor.js sellers                列出所有监控卖家
   node monitor.js check [name|id]        完整检查（抓取 + 日报）
   node monitor.js check all              检查所有卖家
 
 ${CYAN}示例${RESET}
   node monitor.js store            抓取默认店铺
   node monitor.js store all        抓取所有卖家
   node monitor.js store JUDX       按名称查找卖家
   node monitor.js add https://weidian.com/item.html?itemID=12345
   node monitor.js add 12345        直接用商品ID添加
   node monitor.js check all        检查所有卖家+报告
   `);
 }
 
 function style(s, color) {
   return `${color}${s}${RESET}`;
 }
 
 // ── Command: store ──
 // ── Check one store ──
async function cmdStoreOne(userId, label) {
  if (userId !== 'all' && isNaN(userId)) {
    const found = findSeller(userId);
    if (found.length === 0) {
      console.log(`\n${RED}❌ 未找到卖家: ${userId}${RESET}`);
      console.log(`   可用: ${CYAN}node monitor.js store all${RESET} 查看所有`);
      return;
    }
    if (found.length === 1) {
      userId = found[0].userId;
    } else {
      // Multiple matches - check all
      for (const s of found) {
        await cmdStoreOne(s.userId, s.name);
      }
      return;
    }
  }
  
  // 'all' -> check every seller
  if (userId === 'all') {
    console.log(`\n${BOLD}${CYAN}=== 正在检查 ${SELLERS.length} 个卖家 ===${RESET}`);
    for (const s of SELLERS) {
      try {
        await cmdStoreOne(s.userId, s.name);
      } catch(e) {
        console.log(`\n${RED}❌ ${s.name} 检查失败: ${e.message}${RESET}`);
      }
    }
    console.log(`\n${GREEN}✅ 所有卖家检查完成${RESET}`);
    return;
  }
  
   console.log(`\n${CYAN}📡 正在抓取店铺页面...${RESET}`);
   const html = await fetchStorePage(userId);
   const info = parseStorePage(html);
 
   if (!info.shopName) {
     console.log(`\n${RED}❌ 无法解析店铺信息${RESET}`);
     return;
   }
 
   console.log(`\n${BOLD}${GREEN}🏪 ${info.shopName}${RESET}`);
   if (label) console.log(`  ${BOLD}${label}${RESET}`);
    if (info.sellerName) console.log(`  卖家: ${info.sellerName}`);
   if (info.collectCount) console.log(`  关注: ${info.collectCount.toLocaleString()}`);
   if (info.location) console.log(`  所在地: ${info.location}`);
   console.log(`  总商品数: ${style(info.totalItems ?? '?', YELLOW)}`);
 
   // Categories
   if (info.categories && info.categories.length > 0) {
     console.log(`\n${BOLD}分类:${RESET}`);
     for (const c of info.categories) {
       const tag = c.itemCount > 0 ? style(c.itemCount, GREEN) : style(c.itemCount, DIM);
       console.log(`  • ${c.name}: ${tag}`);
     }
   }
 
   // Compare with last snapshot
   const lastSnap = getLastSnapshot();
   if (lastSnap && info.categories && lastSnap.categories) {
     const diffs = formatCategoryDiff(lastSnap.categories, info.categories);
     if (diffs.length > 0) {
       console.log(`\n${YELLOW}📊 相对于上次检查的变化:${RESET}`);
       for (const d of diffs) {
         const arrow = d.delta > 0 ? `📈 +${d.delta}` : d.delta < 0 ? `📉 ${d.delta}` : '—';
         console.log(`  ${d.name}: ${d.oldCount} → ${d.newCount} ${arrow}`);
       }
     } else {
       console.log(`\n${DIM}商品数量与上次检查一致${RESET}`);
     }
   }
 
   // Save snapshot
   saveStoreSnapshot(info);
   console.log(`\n${DIM}✓ 数据已保存${RESET}`);
 }
 
 // ── Command: add ──
 async function cmdAdd(input) {
   let itemId = input;
 
   // Try to extract from URL
   if (input.startsWith('http')) {
     itemId = extractItemIdFromUrl(input);
     if (!itemId) {
       console.log(`\n${RED}❌ 无法从 URL 中提取商品ID${RESET}`);
       console.log(`   URL 示例: https://weidian.com/item.html?itemID=123456`);
       return;
     }
   }
 
   // Check if already tracked
   const existing = findProduct(itemId);
   if (existing) {
     console.log(`\n${YELLOW}⚠ 该商品已在追踪列表中${RESET}`);
     console.log(`   ID: ${existing.itemId}`);
     console.log(`   名称: ${existing.name || '未知'}`);
     console.log(`   添加时间: ${existing._addedAt ? new Date(existing._addedAt).toLocaleString('zh-CN') : '—'}`);
     return;
   }
 
   console.log(`\n${CYAN}📡 正在抓取商品信息...${RESET}`);
   try {
     const html = await fetchItemPage(itemId);
     const item = parseItemPage(html);
     item.itemId = item.itemId || itemId;
 
     if (!item.name && !item.price) {
       console.log(`\n${YELLOW}⚠ 商品页面可能无效，但依然添加到追踪列表${RESET}`);
       console.log(`   ID: ${itemId}`);
     } else {
       console.log(`\n${GREEN}✅ 抓取成功${RESET}`);
       if (item.name) console.log(`   名称: ${item.name}`);
       if (item.price) console.log(`   价格: ¥${item.price}`);
       if (item.originalPrice && item.originalPrice > item.price) {
         console.log(`   原价: ¥${item.originalPrice}`);
       }
       if (item.images && item.images.length > 0) {
         console.log(`   图片: ${item.images.length}张`);
       }
     }
 
     addProduct(item);
     console.log(`${DIM}✓ 已添加到追踪列表${RESET}`);
 
   } catch (e) {
     // Add with minimal info if fetch fails
     addProduct({ itemId, name: '', price: 0, status: 'fetch_failed' });
     console.log(`\n${RED}❌ 抓取失败 (${e.message})${RESET}`);
     console.log(`${YELLOW}⚠ 已记录 itemId，稍后可重试${RESET}`);
   }
 }
 
 // ── Command: list ──
 function cmdList() {
   const products = listAllProducts();
   if (products.length === 0) {
     console.log(`\n${YELLOW}暂无追踪商品${RESET}`);
     console.log(`  使用 ${CYAN}node monitor.js add <url>${RESET} 添加`);
     return;
   }
 
   console.log(`\n${BOLD}${GREEN}📦 追踪商品 (${products.length})${RESET}`);
 
   // Group by date
   const sorted = [...products].sort((a, b) => new Date(b._addedAt) - new Date(a._addedAt));
   for (const p of sorted) {
     const date = p._addedAt ? new Date(p._addedAt).toLocaleDateString('zh-CN') : '—';
     const price = p.price ? `¥${p.price}` : '';
     const name = p.name || `ID:${p.itemId}`;
     console.log(`  • ${name} ${price ? `(${price})` : ''} ${DIM}[${date}]${RESET}`);
   }
 }
 
 // ── Command: report ──
 function cmdReport() {
   const markdown = generateDailyReport();
 
   // Save to file
   const reportsDir = join(__dirname, 'data/reports');
   if (!existsSync(reportsDir)) {
     mkdirSync(reportsDir, { recursive: true });
   }
   const today = new Date().toISOString().slice(0, 10);
   const reportPath = join(reportsDir, `日报_${today}.md`);
   writeFileSync(reportPath, markdown, 'utf-8');
 
   console.log(`\n${GREEN}✅ 日报已生成${RESET}`);
   console.log(`   ${DIM}${reportPath}${RESET}`);
   console.log();
   console.log(markdown);
 }
 
 // ── Command: check (store + report) ──
 async function cmdCheck(userId) {
   await cmdStoreOne(userId);
   cmdReport();
 }
 
 // ── Main ──
 async function main() {
   const args = process.argv.slice(2);
   const command = args[0];
 
   if (!command || command === 'help' || command === '--help') {
     printHelp();
     return;
   }
 
   const sellerId = args[1] || '1785487515';  // default to Cola新店
 
   try {
     switch (command) {
       case 'store':
         await cmdStoreOne(sellerId);
         break;
       case 'add':
         if (!args[1]) {
           console.log(`\n${RED}❌ 需要提供商品 URL 或商品ID${RESET}`);
           console.log(`   用法: node monitor.js add <url|itemId>`);
           return;
         }
         await cmdAdd(args[1]);
         break;
       case 'report':
         cmdReport();
         break;
       case 'list':
         cmdList();
         break;
       case 'sellers':
         console.log(`\n${BOLD}${GREEN}📋 监控卖家列表 (${SELLERS.length})${RESET}`);
         for (const s of SELLERS) {
           console.log(`  • ${s.name} (userid=${s.userId})`);
         }
         break;
       case 'check':
         await cmdCheck(sellerId);
         break;
       default:
         console.log(`\n${RED}未知命令: ${command}${RESET}`);
         printHelp();
     }
   } catch (e) {
     console.error(`\n${RED}❌ 错误: ${e.message}${RESET}`);
     console.error(DIM, e.stack, RESET);
     process.exit(1);
   }
 }
 
 main();
