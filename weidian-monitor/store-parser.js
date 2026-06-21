 /**
  * Parse store HTML — extracts shop info and category data from server-rendered page.
  */
 
 export function parseStorePage(html) {
   const shop = {};
 
   // ── Extract the __rocker-render-inject__ JSON payload ──
   const injectMatch = html.match(/__rocker-render-inject__[^>]+data-obj="([^"]+)"/);
   if (injectMatch) {
     try {
       const decoded = injectMatch[1]
         .replace(/&quot;/g, '"')
         .replace(/&#34;/g, '"')
         .replace(/&#x22;/g, '"');
       const data = JSON.parse(decoded);
       const d = data.data || {};
 
       // Shop header
       const h = d.shopHeader || {};
       shop.shopName = h.name || '';
       shop.sellerName = h.sellerName || '';
       shop.collectCount = h.collect || 0;
       shop.location = (d.shopLocation || {}).city || '';
       shop.logo = h.logo || '';
       shop.note = h.note || '';
       shop.shopId = d.shopId || 0;
 
       // Categories from moduleList (type 5 = item category modules)
       const modules = d.moduleList || [];
       const categories = [];
       let totalItems = 0;
       for (const mod of modules) {
         if (mod.type === 5 && mod.title) {
           const count = mod.cate_item_num || 0;
           categories.push({
             name: mod.title,
             cateId: mod.cate_id || '',
             itemCount: count,
             pageSize: mod.page_size || 20
           });
           totalItems += count;
         }
       }
       shop.categories = categories;
       shop.totalItems = totalItems;
 
       // Extract shopDetailCtx for potential API calls
       shop.shopDetailCtx = d.shopDetailCtx || '';
 
     } catch (e) {
       // fallback to regex
     }
   }
 
   // ── Fallback: extract shop name from <title> ──
   if (!shop.shopName) {
     const titleMatch = html.match(/<title>([^<]+)<\/title>/);
     shop.shopName = titleMatch ? titleMatch[1] : '';
   }
 
   // ── Fallback: extract categories from HTML if inject failed ──
   if (!shop.categories || shop.categories.length === 0) {
     const catMatches = html.matchAll(/cate_id["']:\s*["']([^"']+)["'][^}]+title["']:\s*["']([^"']+)["'][^}]+cate_item_num["']:\s*(\d+)/g);
     const categories = [];
     let totalItems = 0;
     for (const m of catMatches) {
       const count = parseInt(m[3]) || 0;
       categories.push({ name: m[2], cateId: m[1], itemCount: count });
       totalItems += count;
     }
     if (categories.length > 0) {
       shop.categories = categories;
       shop.totalItems = totalItems;
     }
   }
 
   // ── SSR shop name fallback ──
   if (!shop.shopName) {
     const snMatch = html.match(/"name"\s*:\s*"([^"]+)"(?:[^}]*"collect"\s*:\s*(\d+))?/);
     if (snMatch) {
       shop.shopName = snMatch[1];
       if (snMatch[2]) shop.collectCount = parseInt(snMatch[2]) || 0;
     }
   }
 
   return shop;
 }
 
 export function formatCategoryDiff(oldCats, newCats) {
   const diff = [];
   for (const nc of newCats) {
     const oc = oldCats.find(c => c.name === nc.name);
     if (!oc) {
       diff.push({ name: nc.name, oldCount: 0, newCount: nc.itemCount, delta: nc.itemCount });
     } else if (oc.itemCount !== nc.itemCount) {
       diff.push({ name: nc.name, oldCount: oc.itemCount, newCount: nc.itemCount, delta: nc.itemCount - oc.itemCount });
     }
   }
   return diff;
 }
