# Setup on Windows (PowerShell)

You are on PowerShell, not bash. `printf`, `echo -n` and `cat > file` do not exist
there. Everything below is the PowerShell equivalent.

Run all of it from the repo folder (the one containing `wrangler.toml`).

---

## 1. The likely cause of "wrong password"

`wrangler secret put` reads the value from **stdin**. If you typed it at the
interactive prompt, or piped it with double quotes, PowerShell can hand over the
surrounding quote characters or a trailing newline. The secret then stored is

    "Password123"     <- 13 characters, quotes included

but the login box sends

    Password123       <- 11 characters

so the comparison fails, correctly. Same value, different bytes.

The fix is to never let PowerShell decide. Use single quotes and pipe.

---

## 2. Set the production password

```powershell
$pw = 'ChooseYourPasswordHere'
$pw.Length                                  # note this number
$pw | npx wrangler secret put CAPTURE_PASSWORD
```

Use **single quotes**. In PowerShell single quotes are literal — `$`, backtick and
everything else are passed through unchanged. Double quotes are not literal and
will expand anything that looks like a variable.

Then check it landed:

```powershell
npx wrangler secret list
```

You should see `CAPTURE_PASSWORD` and `LONGCAT_API_KEY`.

Then open `https://inventaire.magazem.workers.dev/health` and compare the
character count it reports against the `$pw.Length` you noted. If health says two
more than you expect, quotes got stored — delete and redo:

```powershell
npx wrangler secret delete CAPTURE_PASSWORD
```

### Two things that trip people up here

- A secret only exists **for a deployed Worker**. If the deploy has not run since
  you created the secret, `secret put` still succeeds but nothing is using it yet.
- A newly stored secret takes effect on the **next request**, not instantly on the
  request in flight. Reload `/health` once.

---

## 3. Zero-quoting fallback: the dashboard

If any of the above still misbehaves, skip the CLI entirely:

Cloudflare dashboard → **Workers & Pages** → **inventaire** → **Settings** →
**Variables and Secrets** → **Add** → type `CAPTURE_PASSWORD`, paste the value,
set the type to **Secret** (encrypted) → **Deploy**.

Typing into a web form cannot introduce quoting. This is the reliable path and
there is nothing wrong with using it.

---

## 4. Local dev: creating `.dev.vars`

`.dev.vars` is the local-only substitute for secrets. It is gitignored, so it
never leaves your machine.

PowerShell here-string — note `@'` on its own line and `'@` at column 1:

```powershell
@'
CAPTURE_PASSWORD=ChooseYourPasswordHere
LONGCAT_API_KEY=paste-the-key-here
'@ | Set-Content -Path .dev.vars -Encoding utf8 -NoNewline
```

Verify there are no invisible characters:

```powershell
Get-Content .dev.vars | Format-Hex
```

Read the right-hand column. You want to see the plain characters and nothing else.
Two things to look for:

- `22` — that is a `"` character. It should not be there.
- `EF BB BF` at the very start — a UTF-8 BOM. `-Encoding utf8` in **PowerShell 7**
  writes no BOM; **Windows PowerShell 5.1** writes one. If you see it, use:

```powershell
[System.IO.File]::WriteAllText("$PWD\.dev.vars", "CAPTURE_PASSWORD=ChooseYourPasswordHere`nLONGCAT_API_KEY=paste-the-key-here`n")
```

Check which PowerShell you have with `$PSVersionTable.PSVersion` — 5.x is the old
one, 7.x is the modern one.

---

## 5. Local dev loop

```powershell
npx wrangler dev --local
```

Then open the address it prints (`http://localhost:8787`) and go to `/capture`.

`--local` uses a local D1 and local R2, so nothing you capture during testing
touches the real data.

To run against the **real** D1 and R2 (what we did during the capture-app tests):

```powershell
npx wrangler dev --remote
```

Stop either with `Ctrl+C` in that window.

---

## 6. Quick reference

| bash | PowerShell |
|---|---|
| `printf 'x' \| cmd` | `'x' \| cmd` |
| `echo -n "$V"` | `$V` (no trailing newline when piped) |
| `cat > f <<'EOF' ... EOF` | `@' ... '@ \| Set-Content -Path f` |
| `xxd f` / `hexdump -C f` | `Get-Content f \| Format-Hex` |
| `export V=x` | `$env:V = 'x'` |
| `which wrangler` | `Get-Command wrangler` |
| `rm f` | `Remove-Item f` |

Single quotes in PowerShell = literal. Double quotes = expanded. When a value
contains anything unusual, always use single quotes.
