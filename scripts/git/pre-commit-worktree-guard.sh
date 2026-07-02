#!/usr/bin/env bash
set -euo pipefail

branch="$(git branch --show-current)"
top="$(git rev-parse --show-toplevel)"
pwd_now="$(pwd)"
assignment_file="$top/.worktree-branch"

fail() {
  echo ""
  echo "❌ $1"
  echo ""
  exit 1
}

warn() {
  echo "⚠️  $1"
}

branch_allowed() {
  local role="$1"
  local name="$2"

  case "$role" in
    builder1|builder2|builder3|builder4)
      [[ "$name" == feature/* ]]
      ;;
    review)
      [[ "$name" == review/* || "$name" == fix/* ]]
      ;;
    *)
      return 1
      ;;
  esac
}

# Never allow commits directly to main
if [[ "$branch" == "main" ]]; then
  fail "Direct commits to 'main' are blocked. Create a feature branch in a builder worktree."
fi

# Block integration branches that mix milestones
if [[ "$branch" == merge/* ]]; then
  fail "Commits on merge/* branches are blocked. Use a feature/* branch in one builder worktree."
fi

worktree_role=""
case "$pwd_now" in
  *kalshi-builder1*)
    worktree_role="builder1"
    ;;
  *kalshi-builder2*)
    worktree_role="builder2"
    ;;
  *kalshi-builder3*)
    worktree_role="builder3"
    ;;
  *kalshi-builder4*)
    worktree_role="builder4"
    ;;
  *kalshi-review*)
    worktree_role="review"
    ;;
  *KalshiBot*)
    fail "Feature commits from the primary worktree are blocked. Use a builder worktree (kalshi-builder1–4)."
    ;;
  *)
    fail "Commit blocked outside a builder/reviewer worktree.
Current directory:
   $pwd_now

Use kalshi-builder1, kalshi-builder2, kalshi-builder3, kalshi-builder4, or kalshi-review."
    ;;
esac

case "$worktree_role" in
  builder1|builder2|builder3|builder4)
    if ! branch_allowed "$worktree_role" "$branch"; then
      fail "Builder worktrees must use feature/* branches (current: $branch)."
    fi
    ;;
  review)
    if ! branch_allowed "$worktree_role" "$branch"; then
      fail "Review worktree must use review/* or fix/* branches (current: $branch)."
    fi
    ;;
esac

if [[ ! -f "$assignment_file" ]]; then
  fail "Missing .worktree-branch in this worktree.

Assign the current milestone branch before committing:
   npm run worktree:assign -- $branch"
fi

assigned_branch="$(tr -d '[:space:]' < "$assignment_file")"
if [[ -z "$assigned_branch" ]]; then
  fail ".worktree-branch is empty. Run:
   npm run worktree:assign -- feature/your-milestone"
fi

if [[ "$branch" != "$assigned_branch" ]]; then
  fail "Branch/worktree mismatch.
   Worktree assignment: $assigned_branch
   Current branch:      $branch

Fix with:
   git checkout $assigned_branch
   npm run worktree:assign -- $assigned_branch

Or, if starting a new milestone:
   git checkout -B feature/new-milestone origin/main
   npm run worktree:assign -- feature/new-milestone"
fi

# Ensure this branch is checked out in the current worktree (not another path)
while IFS= read -r line; do
  wt_path="$(echo "$line" | awk '{print $1}')"
  wt_branch="$(echo "$line" | sed -n 's/.*\[\([^]]*\)\].*/\1/p')"
  if [[ -n "$wt_branch" && "$wt_branch" == "$branch" && "$wt_path" != "$top" ]]; then
    fail "Branch '$branch' is checked out in another worktree:
   $wt_path

Use that worktree or choose a different branch."
  fi
done < <(git worktree list)

echo "✅ Worktree check passed ($worktree_role @ $branch)"
