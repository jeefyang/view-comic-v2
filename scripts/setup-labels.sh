#!/usr/bin/env bash
# Create the labels the matt-pocock skills reference in this repo.
# Idempotent: `gh label create --force` updates an existing label instead of failing.
#
# Run from the repo root, after `gh` is installed and authenticated:
#   "C:\Program Files\Git\bin\bash.exe" scripts/setup-labels.sh

set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "gh not found on PATH. Run scripts/setup-gh.sh first." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "gh is installed but not authenticated. Run: gh auth login" >&2
  exit 1
fi

echo "Repo: $(gh repo view --json nameWithOwner --jq .nameWithOwner)"
echo

# role                     color     description
LABELS=(
  "needs-triage|fbca04|Maintainer needs to evaluate this issue"
  "needs-info|d876e3|Waiting on reporter for more information"
  "ready-for-agent|0e8a16|Fully specified, ready for an AFK agent"
  "ready-for-human|1d76db|Requires human implementation"
  "wontfix|cfd3d7|Will not be actioned"
  "wayfinder:map|5319e7|Wayfinder map issue holding Notes / Decisions-so-far / Fog"
  "wayfinder:research|006b75|Wayfinder ticket answered by research"
  "wayfinder:prototype|c2e0c6|Wayfinder ticket answered by a throwaway prototype"
  "wayfinder:grilling|b60205|Wayfinder ticket answered by grilling the user"
  "wayfinder:task|bfd4f2|Wayfinder ticket that is just work to be done"
)

for entry in "${LABELS[@]}"; do
  IFS='|' read -r name color desc <<<"$entry"
  if gh label create "$name" --color "$color" --description "$desc" --force >/dev/null 2>&1; then
    echo "  ok    $name"
  else
    echo "  FAIL  $name" >&2
  fi
done

echo
echo "Done. Verify with: gh label list --limit 100"
