#!/bin/bash
# scripts/validate.sh — Quick pre-push checks to catch build-breaking issues
# Run: bash scripts/validate.sh

set -e
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'
ERRORS=0

echo "Running pre-push validation..."

# Get changed TS/TSX files in last commit
CHANGED=$(git diff --name-only HEAD~1 -- '*.ts' '*.tsx' 2>/dev/null || echo "")
[ -z "$CHANGED" ] && echo -e "${GREEN}No TS files changed.${NC}" && exit 0

echo "Checking $(echo $CHANGED | wc -w | tr -d ' ') file(s)..."

for f in $CHANGED; do
  [ ! -f "$f" ] && continue
  # Use node to check for duplicate const/let at the same scope level
  RESULT=$(node -e "
    const fs = require('fs');
    const code = fs.readFileSync('$f', 'utf8');
    const lines = code.split('\n');
    const errors = [];
    // Track vars per function scope using brace depth
    let depth = 0;
    const scopeVars = [new Map()]; // stack of maps
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trimStart();
      // Track brace depth (approximate — ignoring strings/comments for speed)
      for (const ch of trimmed) {
        if (ch === '{') { depth++; scopeVars.push(new Map()); }
        if (ch === '}') { depth = Math.max(0, depth - 1); scopeVars.pop(); if (scopeVars.length === 0) scopeVars.push(new Map()); }
      }
      const m = trimmed.match(/^(?:const|let)\s+\[?\s*([a-zA-Z_\$][a-zA-Z0-9_\$]*)/);
      if (m) {
        const name = m[1];
        const scope = scopeVars[scopeVars.length - 1];
        if (scope.has(name)) {
          errors.push('Line ' + (i+1) + ': duplicate \"' + name + '\" (first at line ' + scope.get(name) + ')');
        } else {
          scope.set(name, i+1);
        }
      }
      if (trimmed === 'debugger' || trimmed === 'debugger;') {
        errors.push('Line ' + (i+1) + ': debugger statement');
      }
    }
    if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  " 2>&1) || {
    echo -e "${RED}ERROR in $f:${NC}"
    echo "$RESULT" | sed "s/^/  /"
    ERRORS=$((ERRORS + 1))
  }
done

echo ""
[ $ERRORS -gt 0 ] && echo -e "${RED}Failed: $ERRORS file(s) with errors${NC}" && exit 1
echo -e "${GREEN}All checks passed!${NC}"
