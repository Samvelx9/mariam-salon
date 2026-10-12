#!/usr/bin/env bash
# Bring up or update the monitoring stack on oracle-server.
#
# Usage: ssh oracle-server 'sudo bash /opt/app/repo/monitoring/up.sh'
#
# On first run it generates the Grafana admin password and a Postgres
# `monitoring` role into /opt/monitoring/monitoring.env (root-only). It never
# prints either password. Read the Grafana one yourself on the server:
#   sudo grep GRAFANA /opt/monitoring/monitoring.env

set -euo pipefail

ENV_FILE=/opt/monitoring/monitoring.env
cd "$(dirname "$0")"

if [ ! -f "$ENV_FILE" ]; then
  echo "== Generating $ENV_FILE =="
  mkdir -p /opt/monitoring
  umask 077
  {
    echo "GRAFANA_ADMIN_PASSWORD=$(openssl rand -hex 16)"
    echo "POSTGRES_MONITORING_PASSWORD=$(openssl rand -hex 24)"
  } > "$ENV_FILE"
fi

echo "== Ensuring the Postgres monitoring role =="
PG_PASS=$(grep '^POSTGRES_MONITORING_PASSWORD=' "$ENV_FILE" | cut -d= -f2)
docker exec -i postgres sh -c 'psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d postgres' <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'monitoring') THEN
    CREATE ROLE monitoring LOGIN;
  END IF;
END
\$\$;
ALTER ROLE monitoring WITH PASSWORD '$PG_PASS' CONNECTION LIMIT 3;
GRANT pg_monitor TO monitoring;
SQL

echo "== Starting the stack =="
docker compose --env-file "$ENV_FILE" pull --quiet
docker compose --env-file "$ENV_FILE" up -d --remove-orphans
docker compose --env-file "$ENV_FILE" ps
