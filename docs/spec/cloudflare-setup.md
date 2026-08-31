# Cloudflare + GitHub setup — what to click, what to send me

Phase A only. All of this gets deleted or archived after the bulk capture.

---

## FIRST — the security rule

**Never paste an API token, API key or secret into our chat.**

Not the Cloudflare token, not the LongCat key, not the Google key. They go
into GitHub Secrets or Cloudflare Secrets, where I never see them and don't
need to. Everything I ask for below is non-secret — account IDs and resource
names, which are meaningless without a token.

If you ever paste one by accident: rotate it immediately, it takes a minute.

---

## PART 1 — Cloudflare dashboard (~10 minutes)

### 1.1 Add the payment method
Since you chose R2: **Manage Account → Billing → Payment Info**.

Then set a spend alert so a mistake can't run away quietly:
**Billing → Notifications → add a billing alert** at a low figure, €5 or so.
We expect €0 — under 1 GB against a 10 GB allowance — but an alert costs
nothing and turns "surprise bill" into "email on day one".

### 1.2 Create the D1 database
**Workers & Pages → D1 SQL Database → Create**
Name it exactly: `inventaire`
→ note the **Database ID** shown after creation.

### 1.3 Create the R2 bucket
**R2 Object Storage → Create bucket**
Name: `inventaire-photos`
Location: **EU** — keep the photos in Europe.
→ no ID needed, the name is the reference.

### 1.4 Create the queue
**Workers & Pages → Queues → Create queue**
Name: `inventaire-jobs`

### 1.5 Find your Account ID
**Workers & Pages → Overview**, right-hand sidebar, "Account ID".
Not a secret — it identifies, it doesn't authorise.

### 1.6 Note your workers.dev subdomain
Same Overview page: `something.workers.dev`. The capture app will live at
`inventaire.<something>.workers.dev` unless you'd rather use a real domain.

---

## PART 2 — GitHub (~5 minutes)

### 2.1 Create a PRIVATE repository
Name it whatever you like — `inventaire` is fine. **Private**, not public:
it will eventually reference your server paths and internal structure.

### 2.2 Create the Cloudflare API token
**Cloudflare → My Profile → API Tokens → Create Token**

Start from the **"Edit Cloudflare Workers"** template, then add these
permissions so the deploy can touch every resource we use:

```
Account │ Workers Scripts        │ Edit
Account │ Workers KV Storage     │ Edit
Account │ D1                     │ Edit
Account │ Workers R2 Storage     │ Edit
Account │ Queues                 │ Edit
Account │ Account Settings       │ Read
```

Scope it to **your account only**. Copy the token **once** — it is shown a
single time.

### 2.3 Put the token into GitHub, not into chat
**Repo → Settings → Secrets and variables → Actions → New repository secret**
Name: `CLOUDFLARE_API_TOKEN`
Value: the token.

Add a second one while you are there:
Name: `CLOUDFLARE_ACCOUNT_ID`
Value: the Account ID from 1.5.

### 2.4 The LongCat key does NOT go in GitHub
It goes into the Worker itself as a runtime secret, so it never touches the
repository or the build. Either:
```
npx wrangler secret put LONGCAT_API_KEY
```
or **Workers & Pages → your worker → Settings → Variables → Add → Encrypt**.

We do this after the first deploy exists.

---

## PART 3 — What to send me (all non-secret)

```
Account ID              (1.5)
D1 Database ID          (1.2)
workers.dev subdomain   (1.6)
GitHub repo URL         (2.1)
```

Confirm the resource names match: `inventaire`, `inventaire-photos`,
`inventaire-jobs`. If you named them differently, tell me what you used —
easier than renaming.

I'll then write the Worker, the schema, the pipeline and the GitHub Actions
workflow, and you push once.

---

## PART 4 — What we are NOT doing yet

- **Cloudflare Access** (the login for your colleagues) — configured after
  the app exists, so there is something to protect.
- **Google Cloud Translation** — needed only at the Tigrinya cross-check step.
- **A custom domain** — `workers.dev` is fine for a temporary capture tool.

---

## Why GitHub Actions rather than deploying from your laptop

You suggested it and it is the better choice for this project:

- **The code is reviewable before it runs.** You can read the diff in the
  repo rather than trusting a command.
- **Deploys are reproducible.** The same workflow every time, not "whatever
  was on my laptop that day".
- **It doesn't depend on your machine.** If you're away, a colleague with
  repo access can still ship a fix.
- **It leaves a history.** Every deploy is a commit, with a timestamp and a
  reason — which matters for D16, the successor question.

The one cost: the API token now lives in GitHub. Scope it to this account,
and if the project ever ends, delete the token — that revokes everything in
one click.
