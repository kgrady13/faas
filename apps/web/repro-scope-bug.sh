#!/usr/bin/env bash
set -euo pipefail

# Repro: `sbx snapshots list --scope` returns 0 results
# Usage: TEAM_SLUG=my-team ./repro-scope-bug.sh

TEAM="${TEAM_SLUG:?Set TEAM_SLUG}"

echo "--- create sandbox ---"
sbx create --scope "$TEAM"
# ^ copy the sandbox ID from output

echo ""
echo "--- snapshot it (paste sandbox ID) ---"
echo "Run: sbx snapshot <SANDBOX_ID> --scope $TEAM --stop"

echo ""
echo "--- then try listing ---"
echo "Run: sbx snapshots list --scope $TEAM"
echo "Expected: 1 snapshot. Actual: 0 rows."

# #!/usr/bin/env bash
# set -euo pipefail

# # ─── Repro: sbx snapshots list --scope ignores team scope ───
# #
# # Prerequisites:
# #   - sandbox CLI v2.5.6+  (npm i -g sandbox)
# #   - Logged in             (sbx login)
# #   - Member of >=2 teams
# #
# # Usage:
# #   chmod +x repro-scope-bug.sh
# #   TEAM_SLUG=my-team ./repro-scope-bug.sh

# TEAM="${TEAM_SLUG:?Set TEAM_SLUG to the team you want to test against}"
# SBX="${SBX_BIN:-sbx}"

# echo "Using CLI: $($SBX --version)"
# echo "Team:      $TEAM"
# echo ""

# # ── Step 1: Create 5 sandboxes ──
# # Note: stdout gets the sandbox ID (cyan ANSI), stderr gets the decoration.
# # We capture stdout and strip ANSI codes.
# strip_ansi() { sed 's/\x1b\[[0-9;]*m//g' | tr -d '[:space:]'; }

# echo "=== Step 1: Create 5 sandboxes under --scope $TEAM ==="
# SANDBOX_IDS=()
# for i in {1..5}; do
#   ID=$($SBX create --scope "$TEAM" 2>/dev/null | strip_ansi)
#   SANDBOX_IDS+=("$ID")
#   echo "  [$i/5] $ID"
# done

# echo ""

# # ── Step 2: Snapshot each sandbox ──
# # `snapshot` requires --stop (it stops the sandbox as a side effect).
# # The snapshot ID is printed by the spinner to stderr: "✔ Snapshot snap_xxx created."
# echo "=== Step 2: Snapshot each sandbox ==="
# SNAPSHOT_IDS=()
# for ID in "${SANDBOX_IDS[@]}"; do
#   OUTPUT=$($SBX snapshot "$ID" --scope "$TEAM" --stop 2>&1 | strip_ansi)
#   SNAP=$(echo "$OUTPUT" | grep -oE 'snap_[a-zA-Z0-9]+')
#   SNAPSHOT_IDS+=("$SNAP")
#   echo "  $ID → $SNAP"
# done

# echo ""

# # ── Step 3: Prove snapshots exist individually ──
# echo "=== Step 3: Verify each snapshot exists via 'snapshots get' ==="
# for SNAP in "${SNAPSHOT_IDS[@]}"; do
#   $SBX snapshots get "$SNAP" --scope "$TEAM"
# done

# echo ""

# # ── Step 4: The bug ──
# echo "=============================================="
# echo "=== Step 4: THE BUG — list returns nothing ==="
# echo "=============================================="
# echo ""
# echo "\$ sbx snapshots list --scope $TEAM"
# echo "---"
# $SBX snapshots list --scope "$TEAM"
# echo "---"
# echo ""
# echo "Expected ${#SNAPSHOT_IDS[@]} snapshots. Got 0."

# echo ""

# # ── Step 5: Workaround ──
# echo "=== Step 5: Workaround — pass --project explicitly ==="
# echo ""
# echo "\$ sbx snapshots list --scope $TEAM --project vercel-sandbox-default-project"
# echo "---"
# $SBX snapshots list --scope "$TEAM" --project vercel-sandbox-default-project
# echo "---"

# echo ""

# # ── Cleanup ──
# echo "=== Cleanup ==="
# for SNAP in "${SNAPSHOT_IDS[@]}"; do
#   $SBX snapshots delete "$SNAP" --scope "$TEAM" 2>/dev/null || true
# done
# echo "Cleaned up ${#SNAPSHOT_IDS[@]} snapshots."