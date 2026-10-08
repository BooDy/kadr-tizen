#!/usr/bin/env bash
# scripts/tizen-deploy.sh
set -e

# Add Tizen tools to PATH if installed in user's home directory
if [ -d "$HOME/tizen-studio/tools" ]; then
  export PATH="$HOME/tizen-studio/tools:$HOME/tizen-studio/tools/ide/bin:$PATH"
fi

TV_TARGET=${1:-"UA55TU7000UXEG"}

if [ -z "$TV_TARGET" ]; then
  echo "Usage: ./scripts/tizen-deploy.sh <TV_IP_OR_TARGET_NAME>"
  exit 1
fi

# If target looks like an IP address, connect via sdb first
if [[ "$TV_TARGET" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+ ]]; then
  echo "Connecting to $TV_TARGET..."
  sdb connect "$TV_TARGET" || sdb connect "${TV_TARGET}:26101" || true
  RESOLVED_TARGET=$(sdb devices | grep "$TV_TARGET" | awk '{print $3}' | head -n 1)
  if [ -n "$RESOLVED_TARGET" ]; then
    TV_TARGET="$RESOLVED_TARGET"
    echo "Resolved target name: $TV_TARGET"
  fi
fi

echo "Building and signing kadr.wgt..."
npm run build
cp config.xml dist/config.xml
cp public/icon.png dist/icon.png
cp public/kadr-logo.png dist/kadr-logo.png

if command -v tizen &> /dev/null; then
  rm -f kadr.wgt Kadr.wgt
  tizen package -t wgt -s kadr -o . -- dist
  cp -f Kadr.wgt kadr.wgt 2>/dev/null || true
else
  npm run package:wgt
fi

echo "Deploying kadr.wgt to $TV_TARGET..."
tizen install -n kadr.wgt -t "$TV_TARGET"

echo "Launching kadr000001.KadrTV on $TV_TARGET..."
tizen run -p kadr000001.KadrTV -t "$TV_TARGET"

echo "Deployment complete! App is running on TV."
