# Revert runs (mutation checks)

Each maintenance round proves its tests by reverting every rule it built, and every fix its review
asked for, one at a time. Each revert happens in a copy of the repository: the runner applies one
change, runs that entry's tests, and expects a failure, then restores the file. A revert whose tests
still pass means the rule has no test that guards it.

| Runner | Round | Entries |
|---|---|---|
| `mutate-m23.py` to `mutate-m25.py` | Maintenance 23 to 25 | run through `mutate-m26.py --all` |
| `mutate-m26.py` | Maintenance 26, and with `--all` 23 to 26 | 1199 with `--all` |
| `mutate-m27.py` | Maintenance 27 (round I) | 193 |
| `mutate-m28.py` | Maintenance 28 (round J) | 83 |
| `mutate-m29.py` | Maintenance 29 (round K) | 32 |
| `mutate-m30.py` | Maintenance 30 (round L) | 87, before the fourth review pass's fixes |

The tables are data: each row is `(name, file, old, new, tests, nth)`. `mutate-m30.py`'s table is
written from `table_m30.txt`: edit the `.txt`, then run `python3 table_m30.py`. Never write a table
through a shell heredoc, which collapses its backslashes. Each new round copies `mutate-m30.py` as
its own runner, with its own table.

## Running one on Linux

Run a runner from the repository, against a copy (`--repo=` exists from M26 on). Never run one
against the working tree you are editing:

```bash
REPO="$PWD"
COPY="$(dirname "$REPO")/wc4-revert"
mkdir -p "$COPY"
rsync -a --delete --exclude node_modules --exclude dist --exclude .git "$REPO"/ "$COPY"/
(cd "$COPY" && npm ci)
python3 tools/reverts/mutate-m30.py --repo="$COPY" --check
python3 tools/reverts/mutate-m30.py --repo="$COPY" | tee m30-reverts.log
```

- **Sync before each run**, after every code change. Use the `rsync` line again; the copy keeps its
  own `node_modules`. Give the copy its own `npm ci`: a linked `node_modules` can be emptied when
  the copy is removed.
- **Flags:**
  - `--check` only checks that every anchor is found once.
  - Name prefixes (`6a 31b`) run only those entries.
  - `--utc` (M28 on) runs the tests in UTC and then `scripts/test-zones.mjs`, as CI does.
  - `--all` (M26) adds the M23 to M25 tables.
  - `--resume=log1,log2` (M26) skips entries those logs already report.
- **Guard prefix lists.** An empty `$(…)` passes no prefix and runs the whole table: check it with
  `test -n` first.
- **Start from a green baseline.** Run each entry's test files once, unmutated, in the copy. A test
  that already fails makes its revert's kill meaningless.
- **Run alone.** Under parallel load the heavy suites pass their time-outs. A failure that is a
  time-out is load, not a catch: read the error text, then run that entry alone.

## Reading the result

- `KILLED`: a test failed, so the revert was caught. Every entry must end here.
- `SURVIVED`: every test still passed. Add or widen a test until the revert is caught, and record
  the fix in the round's report.
- `ANCHOR x0` / `ANCHOR x2`: the anchor text is gone or not unique. The code moved: re-anchor the
  entry onto the moved code. If the rule itself no longer exists, mark it superseded with the reason.
  For the M23 to M26 tables this is done in `mutate-m26.py`'s `REANCHORED` and `SUPERSEDED` maps;
  each later runner edits its own row.
- `no summary (compile error?)` or `no tests`: the mutant did not compile, or matched no tests. This
  is no catch, whatever the runner counts it as: rewrite the entry so it compiles, or run it alone if
  it was load.

## State on 2026-10-17 (the final Round L code)

- `--check`: M27 193/193, M28 83/83, M29 32/32 and M30 121/121 anchors found; M26 `--all`
  1199/1199.
- **Last full results, on the final Round L code:**
  - M30 121/121, M29 32/32, M28 83/83 (`--utc`) and M27 193/193 caught.
  - M26 `--all` 1199/1199 caught on the M29 code. Run it again before the consolidated phone review.
- **On a machine in UTC** (the cloud): run M28 with `--utc`, so its local-date entries meet the two
  zones, and M27's three R44-19 calendar-day entries with `TZ=America/New_York`. In UTC they read
  as SURVIVED, which is no fault of the tests.

## Outside the rounds: `mutate-install-icon.py` (2026-10-24)

Install the app, and the launcher icon (`docs/reports/install-and-launcher-icon.md`): 54 entries.
Besides Vitest files it runs commands: the icon generator's own checks, the build with
`verify-build`, and browser tests on a fresh build. Each command entry names the text its failure
must print, its own assertion's; a command that fails without it (a build error, a busy port)
reads WRONG FAILURE, and so does a Vitest entry whose only failure is a time-out. Neither is a
catch. Stop any server on ports 4173 and 4175 first: the browser entries start their own. On
Windows the shell is `cmd.exe`, which reads `;` as part of an argument: a step that must run
whatever its exit code is the entry's own `step`.
