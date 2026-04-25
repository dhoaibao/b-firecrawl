#!/usr/bin/env bash
set -euo pipefail

pg_major="${PG_MAJOR:-17}"
conf_sample="/usr/share/postgresql/${pg_major}/postgresql.conf.sample"
target_db="${POSTGRES_DB:-postgres}"

if grep -q "^cron.database_name =" "$conf_sample"; then
  sed -ri "s/^cron\.database_name = .*/cron.database_name = '${target_db}'/" "$conf_sample"
else
  printf "\ncron.database_name = '%s'\n" "$target_db" >> "$conf_sample"
fi

exec docker-entrypoint.sh "$@"
