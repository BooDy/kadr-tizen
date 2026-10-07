#!/usr/bin/env bash
# scripts/tizen-deploy.sh
set -e

TV_IP=${1:-""}

if [ -z "$TV_IP" ]; then
  echo "Usage: ./scripts/tizen-deploy.sh <TV_IP_OR_TARGET_NAME>"
  exit 1
fi

echo "Deploying kadr.wgt to $TV_IP..."
tizen install -n kadr.wgt -t "$TV_IP"
tizen run -p kadr000001.KadrTV -t "$TV_IP"
