/**
 * 自动翻译 — 将商品中文标题翻译成英文，写入 products.json 的 enTitle 字段
 * 使用 Google Translate 免费接口（无需 API Key）
 *
 * 用法: node translate.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'data', 'products.json');

// ── 调用 Google Translate 免费接口 ──
function translateText(text) {
  return new Promise((resolve, reject) => {
    const q = encodeURIComponent(text.slice(0, 1000));
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=en&dt=t&q=${q}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const translated = parsed[0]?.map(t => t[0]).join('') || '';
          resolve(translated);
        } catch {
          resolve(text); // fallback: 保留原文
        }
      });
    }).on('error', (err) => {
      console.error(`  ⚠️ 翻译请求失败: ${err.message}`);
      resolve(text); // fallback
    });
  });
}

// ── 主流程 ──
async function main() {
  if (!existsSync(DB_PATH)) {
    console.log('❌ 未找到 products.json，请先运行扫描脚本。');
    process.exit(1);
  }

  const products = JSON.parse(readFileSync(DB_PATH, 'utf-8'));
  console.log(`📦 共 ${products.length} 件商品`);

  const needTranslate = products.filter(p => p.name && !p.enTitle);
  console.log(`🌐 需要翻译: ${needTranslate.length} 件`);

  if (needTranslate.length === 0) {
    console.log('✅ 所有商品已有英文标题，无需翻译');
    return;
  }

  let success = 0;
  let fail = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (!p.name || p.enTitle) continue;

    process.stdout.write(`  [${i + 1}/${products.length}] ${p.name.slice(0, 30)}... `);

    const translated = await translateText(p.name);
    if (translated && translated !== p.name) {
      p.enTitle = translated;
      success++;
      console.log(`→ ${translated.slice(0, 50)}`);
    } else {
      fail++;
      console.log(`⚠️ 翻译失败，保留原文`);
    }

    // 小额延迟，避免被限流
    if (i < products.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // 写回文件
  writeFileSync(DB_PATH, JSON.stringify(products, null, 2), 'utf-8');
  console.log(`\n✅ 完成！成功: ${success} 件，失败: ${fail} 件`);
}

main().catch(console.error);
