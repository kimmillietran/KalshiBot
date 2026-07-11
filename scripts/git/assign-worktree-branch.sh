#!/usr/bin/env bash
set -euo pipefail

top="$(git rev-parse --show-toplevel)"
branch="${1:-$(git branch --show-current)}"

if [[ -z "$branch" ]]; then
  echo "❌ No branch specified and none checked out."
  echo "Usage: npm run worktree:assign -- <branch>"
  echo "  Builder:  feature/m6.XXy-milestone-slug"
  echo "  Review:   review/pr-id  or  fix/short-description"
  exit 1
fi

branch_allowed() {
  local worktree_path="$1"
  local name="$2"

  case "$worktree_path" in
    *kalshi-builder1*|*kalshi-builder2*|*kalshi-builder3*|*kalshi-builder4*)
      [[ "$name" == feature/* ]]
      ;;
    *kalshi-review*)
      [[ "$name" == review/* || "$name" == fix/* ]]
      ;;
    *)
      return 1
      ;;
  esac
}

case "$top" in
  *kalshi-builder1*|*kalshi-builder2*|*kalshi-builder3*|*kalshi-builder4*|*kalshi-review*)
    if ! branch_allowed "$top" "$branch"; then
      case "$top" in
        *kalshi-review*)
          echo "❌ Review worktree requires review/* or fix/* (got: $branch)"
          ;;
        *)
          echo "❌ Builder worktrees require feature/* (got: $branch)"
          ;;
      esac
      exit 1
    fi
    ;;
  *)
    echo "❌ Assign branches only from kalshi-builder1, kalshi-builder2, kalshi-builder3, kalshi-builder4, or kalshi-review."
    exit 1
    ;;
esac

printf '%s\n' "$branch" > "$top/.worktree-branch"
echo "✅ Assigned worktree to branch: $branch"
echo "   $(git rev-parse --show-toplevel)"
