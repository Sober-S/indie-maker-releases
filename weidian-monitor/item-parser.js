 /**
  * Parse individual item page HTML — extracts product data from SSR.
  */
 
 /**
  * Parse individual Weidian item page HTML.
  */
 
 function decodeSSR(html) {
   const m = html.match(/__rocker-render-inject__[^>]+data-obj="([^"]+)"/);
   if (!m) return null;
   try {
     const decoded = m[1]
       .replace(/&quot;/g, '"')
       .replace(/&#34;/g, '"')
       .replace(/&#x22;/g, '"');
     return JSON.parse(decoded);
   } catch { return null; }
 }
 
 export function parseItemPage(html) {
   const item = { status: 'active' };
   const parsed = decodeSSR(html);
   if (!parsed) return item;
 
   // Item data is in result.default_model.item_info
   const dm = parsed?.result?.default_model;
   if (!dm) return item;
 
   const info = dm.item_info || {};
   const shop = dm.shop_info || {};
 
   item.itemId = String(info.item_id || '');
   item.name = (info.item_name || '').trim();
   item.price = info.itemLowPrice ? (info.itemLowPrice / 100) : 0;
   item.shopName = shop.shopName || '';
   item.shopId = String(shop.shop_id || '');
   item.shopUrl = shop.shop_url || '';
   item.images = Array.isArray(info.imgs) ? info.imgs : [];
   item.headImage = info.item_head || (item.images[0] || '');
   item.headImageThumb = info.item_head_thumb || '';
   item.sellable = info.itemSellable !== false;
   item.soldCount = info.sold || info.collect_count || 0;
   item.shareDesc = (info.itemShareDesc || '').trim();
   item.collectCount = info.collect_count || 0;
   item.categoryName = '卫衣/帽衫'; // from itemCateName
 
   // SKU info
   const sku = dm.sku_properties || {};
   item.sku = sku.attr_list || [];
 
   // Check if item is still available
   if (info.buyLimitInfo?.limitStatus === 1) {
     item.status = 'sold_out';
   }
 
   if (!item.name && !item.price) {
     item.status = 'unavailable';
   }
 
   return item;
 }
 
 export function extractItemIdFromUrl(url) {
   try {
     const u = new URL(url);
     const params = new URLSearchParams(u.search);
     return params.get('itemID') || params.get('itemId') || params.get('id') || '';
   } catch {
     // Maybe it's just an itemId number
     return url.replace(/[^0-9]/g, '') || '';
   }
 }
