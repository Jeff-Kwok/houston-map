#!/usr/bin/env bash
# Builds the two Houston imagery packs into dist/packs; same commands as the deploy workflow.
set -e
cd "$(dirname "$0")/.."
python3 tools/pack.py --name "Houston region" --bbox 29.035,-96.202,30.486,-94.537 --zmin 8 --zmax 13 --out dist/packs/region
python3 tools/pack.py --name "Houston city" --bbox 29.52,-95.79,30.11,-95.01 --zmin 14 --zmax 15 --out dist/packs/city
