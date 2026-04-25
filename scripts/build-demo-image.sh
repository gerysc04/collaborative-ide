#!/usr/bin/env bash
# Run once on the VPS to build the collide-spenddata-demo Docker image.
# Requires: Docker running, collide-dev image already built.
set -euo pipefail

CONTAINER=spenddata-setup
IMAGE=collide-spenddata-demo

echo "==> Cleaning up any previous setup container..."
docker rm -f "$CONTAINER" 2>/dev/null || true

echo "==> Starting base container from collide-dev..."
docker run -d --name "$CONTAINER" collide-dev sleep infinity

echo "==> Cloning SpendData..."
docker exec "$CONTAINER" git clone https://github.com/gerysc04/SpendData /app

echo "==> Installing dependencies (this may take a minute)..."
docker exec "$CONTAINER" sh -c "cd /app && npm install"

echo "==> Writing .env.local..."
docker exec "$CONTAINER" sh -c "echo 'MONGODB_URI=mongodb://db:27017/spenddata' > /app/.env.local"

echo "==> Copying seed script..."
docker cp "$(dirname "$0")/seed.js" "$CONTAINER:/app/seed.js"

echo "==> Committing image as $IMAGE..."
docker commit "$CONTAINER" "$IMAGE"

echo "==> Cleaning up setup container..."
docker rm -f "$CONTAINER"

echo ""
echo "Done. Image '$IMAGE' is ready."
echo "Guest sessions will start from this image automatically."
