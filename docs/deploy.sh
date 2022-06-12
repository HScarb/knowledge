#!/usr/bin/env sh

set -e

cd docs

npm run build

cd src/.vuepress/dist

# echo 'www.scarb.cn' > CNAME

git init
git add -A
git commit -m 'deploy'

# 如果发布到 https://<USERNAME>.github.io
git push -f git@github.com:HScarb/HScarb.github.io.git master

# 如果发布到 https://<USERNAME>.github.io/<REPO>
#git push -f git@github.com:HScarb/knowledge.git master:gh-pages

cd -
