# Inventaire — Phase A (temporary capture backend)
 
Cloud half of the workshop equipment inventory. **Temporary by design**: it
exists to capture several hundred items quickly, then the data is exported to
`\\SERVER\inventaire\` and this project is archived (design §5.6).
 
The permanent system is two HTML files and a folder on the company server.
Nothing here is load-bearing after the bulk phase.
 
## Layout
 
```
wrangler.toml        bindings: D1, R2 (EU jurisdiction), queue, daily cron
schema.sql           D1 schema — idempotent, applied on every deploy
src/index.js         routes, queue consumer, scheduled sweep, /health
src/capture-page.js  the phone app (self-contained HTML)
src/api.js           capture handlers, ID assignment, model dedupe
src/auth.js          temporary shared-password session
.github/workflows/deploy.yml
```
 
## Two things that will surprise you
 
**R2 is in the EU jurisdiction**, not just an EU location hint. The worker
binding carries it, but every CLI command needs `--jurisdiction eu` or the
bucket reports "not found".
 
**Model numbers have a display form and a match form.** `KT-AS 18 Li` is shown
as typed but matches `KT-AS18LI` when deduping (D32). Matching on the display
form fails exactly the case that decision exists for.
 
## Deploying
 
Push to `main`. GitHub Actions applies the schema, then deploys.
 
Two repository secrets are required:
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
 
## Secrets that are NOT in this repo
 
Two worker runtime secrets. Neither touches git or CI:
 
```
npx wrangler secret put LONGCAT_API_KEY     # the AI key
npx wrangler secret put CAPTURE_PASSWORD    # shared password for the capture app
```
 
`CAPTURE_PASSWORD` is a **temporary stand-in for Cloudflare Access** (design
5.1). It exists because a write endpoint on the open internet with no gate at
all is not acceptable even for a few weeks. Replace it with Access before bulk
capture: email one-time codes, no shared secret to leak or rotate.
 
## Running it locally
 
```
npx wrangler d1 execute inventaire --local --file=./schema.sql
printf 'CAPTURE_PASSWORD="test1234"\nLONGCAT_API_KEY="sk-test"\n' > .dev.vars
npx wrangler dev --local
```
 
`.dev.vars` is gitignored. Local D1 and R2 are emulated, so you can capture
test items without touching production.
 
## Checking it works
 
`/health` writes to R2, reads it back, counts D1 tables and sends a queue
message. It reports each binding separately, so a failure names itself.
 
## Design documents
 
The reasoning behind every decision lives outside this repo: the design study
(D1–D52), the frozen data model, and the output contract. Read those before
changing anything structural — several fields exist because a specific test
failed in a specific way.