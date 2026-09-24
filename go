#!/usr/bin/env bash
set -euo pipefail
git pull --ff-only
bash rigor_beta/scripts/bootstrap-preview-cicd.sh
