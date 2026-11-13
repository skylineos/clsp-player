#!/bin/bash
# Split combined yarn.lock dependency keys into standalone entries for gemnasium scanner.
# Usage: cp yarn.lock yarn.lock.preprocessed && ./scripts/split-yarn-lock
# Reads yarn.lock.preprocessed, writes yarn.lock

if [ ! -f yarn.lock.preprocessed ]; then
  echo "No yarn.lock.preprocessed found"
  exit 1
fi

awk '
BEGIN { in_block = 0; depcount = 0; vcount = 0 }

# Combined key line: contains comma-separated package specs, ends with colon
/, / && /:$/ {
  line = $0
  line = substr(line, 1, length(line) - 1)
  depcount = split(line, deparr, ",")
  in_block = 1
  vcount = 0
  next
}

# Inside a combined block — collect value lines (indented)
in_block && /^    / && NF > 0 {
  vlines[vcount++] = $0
  next
}

# Inside block — skip empty indented lines
in_block && /^    $/ {
  next
}

# New standalone key line — flush previous block if any
in_block && /^[a-zA-Z@._-]+@[^:]+:$/ {
  for (i = 0; i < depcount; i++) {
    print deparr[i]
    for (j = 0; j < vcount; j++) print vlines[j]
    print ""
  }
  in_block = 0
  vcount = 0
  print $0
  next
}

# Default: pass through
{ print $0; next }

END {
  if (in_block) {
    for (i = 0; i < depcount; i++) {
      print deparr[i]
      for (j = 0; j < vcount; j++) print vlines[j]
      print ""
    }
  }
}
' yarn.lock.preprocessed > yarn.lock
