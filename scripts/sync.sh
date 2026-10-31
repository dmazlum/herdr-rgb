#!/bin/sh
# Copies this repo's mods, theme and preview into the Herdr app's home, which
# picks the change up within a second. Use copies, not symlinks: Herdr doesn't
# reload a symlinked mod folder when its files change, and doesn't load
# images through it.
#
#   npm run sync            mods, theme and layout preview
#   npm run sync -- --layout  also overwrite layouts/rgb.json (the app rewrites
#                             it while agents work, so it's left alone by default)
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
home=${HERDR_APP_HOME:-"$HOME/.config/herdr-app"}
[ -d "$home" ] || { echo "no Herdr app home at $home" >&2; exit 1; }
for dir in "$here"/mods/rgb-*; do
  name=$(basename "$dir")
  [ -L "$home/mods/$name" ] && rm "$home/mods/$name"
  mkdir -p "$home/mods/$name"
  rsync -a --delete --exclude gpui-kit.d.ts --exclude jsconfig.json "$dir/" "$home/mods/$name/"
done
mkdir -p "$home/themes" "$home/layouts"
for theme in "$here"/themes/*.json; do
  name=$(basename "$theme")
  [ -L "$home/themes/$name" ] && rm "$home/themes/$name"
  cp "$theme" "$home/themes/$name"
done
cp "$here/layouts/rgb.svg" "$home/layouts/rgb.svg"
if [ "${1:-}" = "--layout" ]; then cp "$here/layouts/rgb.json" "$home/layouts/rgb.json"; fi
echo "synced into $home"
