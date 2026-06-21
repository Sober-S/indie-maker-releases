# Indie-maker Releases

微店卖家商品展示页面。自动采集微店卖家店铺的商品信息，以电商卡片风格展示。

## 目录结构

```
├── products.html          # 商品展示页面（主入口）
├── data/
│   ├── products.json      # 商品数据库
│   ├── store_history.json # 店铺历史记录
│   └── reports/           # 日报
├── scan-stores/           # 扫描脚本
├── translate.mjs          # 中文→英文标题翻译
└── .codex/                # Codex 扫描 Skill
```

## 部署

这是一个纯静态页面，可以直接部署到 GitHub Pages。
把 `products.html` 和 `data/products.json` 放到一个仓库，开启 GitHub Pages 即可。

## 更新商品

1. 运行扫描采集商品
2. 运行翻译添加英文标题
3. 提交 `data/products.json` 到 GitHub

## 在线预览

[点击查看](https://你的用户名.github.io/仓库名/products.html)
