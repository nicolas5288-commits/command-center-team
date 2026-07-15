#!/bin/bash
# 指揮中心部署腳本：自動把 CSS/JS 的版本號 bump 成當下時間戳，避免 GitHub Pages 快取混版。
# 用法：./deploy.sh "commit 訊息"
set -e
cd "$(dirname "$0")"
V=$(date +%Y%m%d%H%M)
# 把 index.html 裡所有 ?v=xxx 換成新時間戳（style.css / config.js / app.js 的引用）
sed -i '' -E "s/\?v=[0-9a-zA-Z]+/?v=$V/g" index.html
git add -A
git commit -m "${1:-deploy $V}"
git push origin main
echo "✅ 已部署 v=$V，約 1 分鐘後生效：https://nicolas5288-commits.github.io/command-center-team/"
