# Git GUIs (and some terminals) do not load nvm, so `pnpm` is missing even
# when Node is installed. nvm.sh puts this repo's Node on PATH; `corepack pnpm`
# then uses `packageManager` from package.json and does not need a global pnpm.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
fi
