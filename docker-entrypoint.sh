#!/bin/sh
# Decodifica a Oracle Wallet do env var base64 antes de iniciar o app

set -e

WALLET_DIR="/app/wallet"

if [ -n "$ORACLE_WALLET_B64" ]; then
  echo "Decodificando Oracle Wallet..."
  mkdir -p "$WALLET_DIR"
  echo "$ORACLE_WALLET_B64" | base64 -d > /tmp/wallet.zip
  unzip -o /tmp/wallet.zip -d "$WALLET_DIR"
  rm /tmp/wallet.zip
  echo "Wallet extraída em $WALLET_DIR"
  export ORACLE_WALLET_LOCATION="$WALLET_DIR"
else
  echo "ORACLE_WALLET_B64 não definida — usando ORACLE_WALLET_LOCATION=$ORACLE_WALLET_LOCATION"
fi

exec node server.js
