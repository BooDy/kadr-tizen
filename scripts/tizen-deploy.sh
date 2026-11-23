#!/usr/bin/env bash
# scripts/tizen-deploy.sh
set -e

# Add Tizen tools to PATH if installed in user's home directory
if [ -d "$HOME/tizen-studio/tools" ]; then
  export PATH="$HOME/tizen-studio/tools:$HOME/tizen-studio/tools/ide/bin:$PATH"
fi

TV_TARGET=""
NO_BUILD=0

for arg in "$@"; do
  if [ "$arg" = "--no-build" ]; then
    NO_BUILD=1
  elif [ -z "$TV_TARGET" ]; then
    TV_TARGET="$arg"
  fi
done

TV_TARGET=${TV_TARGET:-"UA55TU7000UXEG"}

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

if ! sdb devices | grep -q "device"; then
  echo "Error: No Samsung Tizen TV is currently connected to sdb."
  echo "Ensure Developer Mode is enabled on the TV and pass its LAN IP:"
  echo "  npm run deploy:tv -- <TV_LAN_IP>"
  exit 1
fi

echo "Building and signing kadr.wgt..."
if [ "$NO_BUILD" -eq 1 ]; then
  npm run package:wgt -- --no-build
else
  npm run package:wgt
fi

echo "Deploying kadr.wgt to $TV_TARGET..."
tizen install -n kadr.wgt -t "$TV_TARGET"

echo "Launching kadr000001.KadrTV on $TV_TARGET..."
tizen run -p kadr000001.KadrTV -t "$TV_TARGET"

echo "Deployment complete! App is running on TV."
