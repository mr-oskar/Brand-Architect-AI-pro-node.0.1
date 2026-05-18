#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push
pip install -r artifacts/api-server-python/requirements.txt
