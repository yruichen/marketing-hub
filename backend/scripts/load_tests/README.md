# Load Tests

These k6 scripts exercise launch-readiness abuse cases without depending on
production credentials.

## Run

```bash
k6 run -e API_BASE_URL=http://localhost:8000/api -e USERNAME=DEMO -e PASSWORD=123 backend/scripts/load_tests/launch_readiness.js
```

With the local Docker stack, run k6 on the Compose network so Django sees the
allowed `backend` host:

```bash
docker run --rm --network marketing-hub_default \
  -v "$PWD/backend/scripts/load_tests:/scripts" \
  grafana/k6 run \
  -e API_BASE_URL=http://backend:8000/api \
  /scripts/launch_readiness.js
```

Useful overrides:

- `VUS`: virtual users, default `10`
- `DURATION`: duration, default `1m`
- `API_BASE_URL`: API root
- `USERNAME` / `PASSWORD`: test account

The script expects the backend to be running and the account to belong to a
workspace. It checks that normal reads succeed, generation burst pressure
returns controlled responses, and oversized payloads are rejected.

For adversarial-readiness runs, `401`, `403`, and `429` responses are expected
when throttling or authentication defenses are active. The script tracks those
with `controlled_responses` instead of treating them as transport failures.
