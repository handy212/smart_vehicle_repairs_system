#!/usr/bin/env bash
# Load KEY=VALUE pairs from a dotenv file without bash parameter expansion.
# Prevents secrets containing $ (e.g. "$7") from breaking `source` under set -u.

load_env_file() {
  local env_file="$1"
  local line key value

  if [ ! -f "$env_file" ]; then
    echo "load_env_file: file not found: $env_file" >&2
    return 1
  fi

  while IFS= read -r line || [ -n "$line" ]; do
    # Trim leading whitespace
    line="${line#"${line%%[![:space:]]*}"}"
    [ -z "$line" ] && continue
    [[ "$line" =~ ^# ]] && continue

    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      value="${BASH_REMATCH[2]}"
      if [[ "$value" =~ ^\'(.*)\'$ ]]; then
        value="${BASH_REMATCH[1]}"
      elif [[ "$value" =~ ^\"(.*)\"$ ]]; then
        value="${BASH_REMATCH[1]}"
      fi
      export "${key}=${value}"
    fi
  done < "$env_file"
}
