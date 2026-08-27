# Inventaire — Phase A (temporary capture backend)

Cloud half of the workshop equipment inventory. **Temporary by design**: it
exists to capture several hundred items quickly, then the data is exported to
`\\SERVER\inventaire\` and this project is archived (design §5.6).

The permanent system is two HTML files and a folder on the company server.
Nothing here is load-bearing after the bulk phase.

## Layout

```
wrangler.toml   bindings: D1, R2, queue, daily cron
schema.sql      D1 schema — idempotent, applied on every deploy
src/index.js    worker: fetch, queue consumer, scheduled sweep
.github/workflows/deploy.yml
```

## Deploying

Push to `main`. GitHub Actions applies the schema, then deploys.

Two repository secrets are required:
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

## Secrets that are NOT in this repo

The LongCat API key is a **worker runtime secret**, so it never touches git:

```
npx wrangler secret put LONGCAT_API_KEY
```

## Checking it works

`/health` writes to R2, reads it back, counts D1 tables and sends a queue
message. It reports each binding separately, so a failure names itself.

## Design documents

The reasoning behind every decision lives outside this repo: the design study
(D1–D52), the frozen data model, and the output contract. Read those before
changing anything structural — several fields exist because a specific test
failed in a specific way.
