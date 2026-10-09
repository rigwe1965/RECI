#!/usr/bin/env bash
# Start RECI Transport dev servers: web on :3002, admin on :3001.
# Usage: ./start.sh
# Never touches port 3000 (unrelated RMM System process, PID 11724).
set -euo pipefail
cd "$(dirname "$0")"

in_use() { netstat -ano | grep -E "[:.]$1[[:space:]].*LISTENING" >/dev/null 2>&1; }

for port in 3001 3002; do
  if in_use "$port"; then
    echo "Port $port is already in use — servers may already be running."
    echo "  Web:   http://localhost:3002"
    echo "  Admin: http://localhost:3001/admin"
    echo "To restart, free the port first: netstat -ano | findstr :$port  then  taskkill /F /PID <PID>  (never 11724)"
    exit 1
  fi
done

[ -d node_modules ] || pnpm install

echo "Web:   http://localhost:3002"
echo "Admin: http://localhost:3001/admin"
exec pnpm exec turbo run dev --parallel
