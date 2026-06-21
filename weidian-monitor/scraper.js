import https from 'https';
import http from 'http';
import { URL } from 'url';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

export function fetchURL(urlString, opts = {}) {
  const maxRedirects = opts.maxRedirects ?? 5;
  let redirects = 0;

  function doFetch(currentUrl) {
    return new Promise((resolve, reject) => {
      const url = new URL(currentUrl);
      const mod = url.protocol === 'https:' ? https : http;
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: opts.method || 'GET',
        headers: {
          'User-Agent': opts.ua || UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          ...(opts.headers || {})
        },
        timeout: opts.timeout || 15000,
        rejectUnauthorized: false
      };
      if (opts.body) {
        options.method = 'POST';
        options.headers['Content-Type'] = opts.contentType || 'application/json;charset=UTF-8';
        options.headers['Content-Length'] = Buffer.byteLength(opts.body);
      }
      const req = mod.request(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < maxRedirects) {
          redirects++;
          const loc = res.headers.location;
          const nextUrl = loc.startsWith('http') ? loc : 'https://' + url.hostname + loc;
          req.destroy();
          resolve(doFetch(nextUrl));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf-8') });
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      if (opts.body) req.write(opts.body);
      req.end();
    });
  }
  return doFetch(urlString);
}

export async function fetchStorePage(userId) {
  const url = `https://weidian.com/?userid=${userId}&p=iphone&wfr=BuyercopyURL`;
  const resp = await fetchURL(url, { timeout: 20000 });
  if (resp.status !== 200) throw new Error('Store page returned ' + resp.status);
  return resp.body;
}

export async function fetchItemPage(itemId) {
  const url = `https://weidian.com/item.html?itemID=${itemId}`;
  const resp = await fetchURL(url, { timeout: 15000 });
  if (resp.status !== 200) throw new Error('Item page returned ' + resp.status);
  return resp.body;
}

export async function downloadItemImages(itemId, imageUrls) {
  if (!imageUrls || imageUrls.length === 0) return [];
  const imagesDir = join(__dirname, 'data', 'images', String(itemId));
  if (!existsSync(imagesDir)) mkdirSync(imagesDir, { recursive: true });
  const saved = [];
  for (let i = 0; i < imageUrls.length; i++) {
    try {
      const url = imageUrls[i];
      const resp = await fetchURL(url, { timeout: 10000 });
      if (resp.status === 200) {
        const ext = (url.match(/\.(jpg|jpeg|png|webp)/i) || [])[1] || 'jpg';
        const filename = (i + 1) + '.' + ext;
        const filepath = join(imagesDir, filename);
        writeFileSync(filepath, Buffer.from(resp.body, 'binary'));
        saved.push(filepath);
      }
    } catch (e) { /* skip */ }
  }
  return saved;
}

export async function callThorAPI(path, params) {
  const body = JSON.stringify({ param: JSON.stringify(params) });
  const resp = await fetchURL('https://thor.weidian.com' + path, {
    method: 'POST', contentType: 'application/json;charset=UTF-8', body, timeout: 15000,
    headers: { 'Accept': 'application/json, text/plain, */*' }
  });
  if (resp.status !== 200) throw new Error('Thor API returned ' + resp.status);
  return JSON.parse(resp.body);
}
