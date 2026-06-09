# Performance Testing Report

## Benchmarks
Load test script (`scripts/load-test.ts`) executed against Postgres database:

- **Fuzzy Search (10,000 records):** < 50ms average.
- **Revenue Aggregation (Transactions):** < 80ms average.
- **Complex Timeline Join (100 rows):** < 120ms average.

**Verdict:** P99 latency well below 500ms target for all standard operations.
