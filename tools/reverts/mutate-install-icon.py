"""Install and launcher icon mutation checks (2026-10-24): revert each rule alone, run its tests,
expect a failure, restore. Prints KILLED (a test or check failed) or SURVIVED (all still passed).

  python mutate-install-icon.py --repo=PATH            run every entry in a copy of the repository
  python mutate-install-icon.py --repo=PATH I1 P4b     run the entries whose names start with these
  python mutate-install-icon.py --repo=PATH --check    only check that every anchor is found once

An entry's tests are Vitest files, or a command that must fail on its own assertion: the icon
generator's read-back checks, the build and verify-build, or browser tests on a fresh build. A
command entry names the text its failure must print ("expect"): a command that fails without it
(a build error, a busy port, a server that would not start) reads WRONG FAILURE, which is no catch.
A Vitest entry is caught by a failed assertion; one whose only failure is a time-out reads WRONG
FAILURE too.
A command entry's "step" runs first whatever its exit code (the generator, which writes an icon
before its check stops it), with no shell separator: cmd.exe on Windows reads ";" as part of an
argument. The icons are restored after every entry. Commands run with CI=1, so Playwright starts
its own servers and never reuses another's.

The table below is data: nothing in it runs.
"""
import os
import pathlib
import re
import subprocess
import sys

# The repository this runner sits in (tools/reverts/ -> the root). Run it in a copy instead, with
# --repo=PATH; see tools/reverts/README.md.
ROOT = pathlib.Path(__file__).resolve().parents[2] if "__file__" in globals() else pathlib.Path.cwd()
for _flag in sys.argv[1:]:
    if _flag.startswith("--repo="):
        ROOT = pathlib.Path(_flag.split("=", 1)[1])

OFFER = "src/app/pwa/installOffer.ts"
CARD = "src/features/settings/InstallCard.tsx"
SETTINGS = "src/features/settings/SettingsScreen.tsx"
MAIN = "src/main.tsx"
CONFIG = "vite.config.ts"
ICONS = "scripts/generate-icons.mjs"

T_OFFER = "src/app/pwa/installOffer.test.ts"
T_CARD = "src/features/settings/installCard.test.tsx"


def command(cmd, expect, step=None):
    """A command entry: caught when it exits non-zero and its output matches expect (a regex)."""
    return {"cmd": cmd, "expect": expect, "step": step}


GENERATE = "node scripts/generate-icons.mjs"
VERIFY_BUILD = "npm run build && node scripts/verify-build.mjs"
E2E_INSTALL = ("npm run build && npx playwright test e2e/smoke.spec.ts -g \"Install the app\" "
               "--project=android-412 --retries=0 --reporter=list")
E2E_ICON = ("npm run build && npx playwright test e2e/smoke.spec.ts -g \"app icon\" "
            "--project=android-412 --retries=0 --reporter=list")
E2E_UPDATE = ("npm run build && npx playwright test e2e/pwaUpdate.spec.ts --project=pwa-update "
              "--no-deps -g \"a new release waiting\" --retries=0 --reporter=list")
E2E_OPENED = ("npm run build && npx playwright test e2e/pwa.spec.ts --project=pwa --no-deps "
              "-g \"open as themselves\" --retries=0 --reporter=list")

# The failing line of a browser test, as Playwright marks it in its code frame.
def failing_line(code):
    return r">\s*\d+ \|\s+" + re.escape(code)


MANIFEST_FROM_SERVER = re.escape("Error: the manifest comes from the server, not a kept copy")
NOT_PRECACHED = re.escape("sw.js must not precache manifest.webmanifest")
NETWORK_FIRST = re.escape("sw.js must serve manifest.webmanifest network first")

CARRY_OUT = (
    "        context.drawImage(art, 0, 0, 1, inner, 0, at, at, inner);\n"
    "        context.drawImage(art, last, 0, 1, inner, at + inner, at, far, inner);\n"
    "        context.drawImage(art, 0, 0, inner, 1, at, 0, inner, at);\n"
    "        context.drawImage(art, 0, last, inner, 1, at, at + inner, inner, far);\n"
    "        context.drawImage(art, 0, 0, 1, 1, 0, 0, at, at);\n"
    "        context.drawImage(art, last, 0, 1, 1, at + inner, 0, far, at);\n"
    "        context.drawImage(art, 0, last, 1, 1, 0, at + inner, at, far);\n"
    "        context.drawImage(art, last, last, 1, 1, at + inner, at + inner, far, far);\n"
)
CARD_AT_TOP = (
    "      {/* Install from the app's own page, while the browser offers it (2026-10-24). */}\n"
    "      <InstallCard />\n"
)
MASKABLE_58 = "  { file: 'icon-maskable-512.png', size: 512, scale: 0.58, reach: [0.65, 0.8] },"
MASKABLE_72 = "  { file: 'icon-maskable-512.png', size: 512, scale: 0.72, reach: [0.65, 0.8] },"
LOGO_FULL = "  { file: 'icon-192.png', size: 192, scale: 1, reach: [1.2, 1.3] },"
LOGO_SHRUNK = "  { file: 'icon-192.png', size: 192, scale: 0.72, reach: [1.2, 1.3] },"
VERSIONED = "  return `icons/${file}?v=${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}`;"
PLAIN = "  return `icons/${file}`;"
LEFT_OUT = "(typeof entry === 'string' ? entry : entry.url) !== 'manifest.webmanifest',"
LEFT_IN = "(typeof entry === 'string' ? entry : entry.url) !== 'no-such-file',"
NETWORK = ("            handler: 'NetworkFirst',\n            options: {\n"
           "              cacheName: 'web-manifest',")
CACHE = ("            handler: 'CacheFirst',\n            options: {\n"
         "              cacheName: 'web-manifest',")
NO_CACHE = "              fetchOptions: { cache: 'no-cache' },\n"
DENYLIST = r"        navigateFallbackDenylist: [/\/manifest\.webmanifest$/, /\/icons\//],"

# (name, file, old, new, tests, nth): old and new may be a list of (old, new) pairs.
MUTATIONS = [
    # The browser's offer, held from start-up and used once (Life Mirror's 99bae2e, ported).
    ("I1 the browser's own prompt is held back", OFFER,
     "    event.preventDefault();\n", "", [T_OFFER], None),
    ("I2 the offer is held", OFFER,
     "    held = event as InstallOffer;\n", "", [T_OFFER, T_CARD], None),
    ("I3 a tap calls prompt()", OFFER,
     "    await offer.prompt();\n", "", [T_OFFER, T_CARD], None),
    ("I4 the answer is read from userChoice", OFFER,
     "    const choice = await offer.userChoice;\n    return choice.outcome;",
     "    return 'accepted';", [T_OFFER], None),
    ("I5 the offer is cleared once used", OFFER,
     "    if (held === offer) held = null;\n", "", [T_OFFER, T_CARD], None),
    ("I6 appinstalled clears the offer", OFFER,
     "  const onInstalled = () => {\n    held = null;\n", "  const onInstalled = () => {\n",
     [T_OFFER, T_CARD], None),
    ("I7 one dialog at a time", OFFER,
     "  if (!offer || asking) return 'none';", "  if (!offer) return 'none';", [T_OFFER], None),
    ("I8 the card only while the browser offers", CARD,
     "  if (offer === 'none') return null;\n", "", [T_CARD], None),
    ("I9 the button is off while the dialog is open", CARD,
     "          disabled={offer === 'asking'}", "          disabled={false}", [T_CARD], None),
    ("I10 the button opens the browser's dialog", CARD,
     "          onClick={() => void installApp().catch(() => undefined)}",
     "          onClick={() => undefined}", [T_CARD], None),
    ("I11 Settings shows the card", SETTINGS, CARD_AT_TOP, "", [T_CARD], None),
    ("I12 ... at the top", SETTINGS,
     [(CARD_AT_TOP, ""),
      ("        </Group>\n      </>\n    </>\n  );\n}",
       "        </Group>\n        <InstallCard />\n      </>\n    </>\n  );\n}")],
     None, [T_CARD], None),
    ("I13 the offer is watched from start-up", MAIN,
     "watchInstallOffer();\n", "",
     command(E2E_INSTALL, r"\d+\) \[android-412\] .*an offer made on Today is held"), None),
    # From the review, 2026-10-24.
    ("I14 only the offer used is cleared", OFFER,
     "    if (held === offer) held = null;\n", "    held = null;\n", [T_OFFER], None),
    ("I15 the dialog's end lets the next offer be asked", OFFER,
     "    if (held === offer) held = null;\n    asking = false;\n",
     "    if (held === offer) held = null;\n", [T_OFFER], None),
    ("I16 a prompt the browser refuses raises nothing", CARD,
     "          onClick={() => void installApp().catch(() => undefined)}",
     "          onClick={() => void installApp()}", [T_CARD], None),
    # From the second review, 2026-10-24.
    ("I17 an offer is shown as it comes", OFFER,
     "    held = event as InstallOffer;\n    notify();\n", "    held = event as InstallOffer;\n",
     [T_OFFER, T_CARD], None),
    ("I18 an install is shown as it happens", OFFER,
     "    held = null;\n    notify();\n  };\n  target.addEventListener",
     "    held = null;\n  };\n  target.addEventListener", [T_OFFER, T_CARD], None),
    ("I19 the dialog opening is shown", OFFER,
     "  asking = true;\n  notify();\n", "  asking = true;\n", [T_OFFER, T_CARD], None),
    ("I20 the dialog closing is shown", OFFER,
     "    if (held === offer) held = null;\n    asking = false;\n    notify();\n",
     "    if (held === offer) held = null;\n    asking = false;\n", [T_OFFER, T_CARD], None),
    ("I21 a tap marks the dialog open", OFFER,
     "  asking = true;\n  notify();\n", "  notify();\n", [T_OFFER, T_CARD], None),
    ("I22 stopping drops the offer listener", OFFER,
     "    target.removeEventListener('beforeinstallprompt', onOffer);\n", "", [T_OFFER], None),
    ("I23 ... and the install listener", OFFER,
     "    target.removeEventListener('appinstalled', onInstalled);\n", "", [T_OFFER], None),

    # The launcher's icon: the dumbbell inward, the dark background full bleed.
    ("G1a the launcher icon's artwork at 58%, not the first pick, 72% (the generator's check)", ICONS,
     MASKABLE_58, MASKABLE_72,
     command(GENERATE, re.escape("icon-maskable-512.png has the dumbbell reaching")), None),
    ("G1b ... (the served icon)", ICONS, MASKABLE_58, MASKABLE_72,
     command(E2E_ICON, failing_line("expect(launcher.reach).toBeLessThanOrEqual(0.8);"),
             step=GENERATE), None),
    ("G2a the background carried out to every edge (the generator's check)", ICONS,
     CARRY_OUT, "",
     command(GENERATE, re.escape("icon-maskable-512.png is not dark and opaque to its edge")), None),
    ("G2b ... (the served icon)", ICONS, CARRY_OUT, "",
     command(E2E_ICON, failing_line("expect(launcher.edgesDark"), step=GENERATE), None),
    ("G3a the in-app icon stays full bleed (the generator's check)", ICONS,
     LOGO_FULL, LOGO_SHRUNK,
     command(GENERATE, re.escape("icon-192.png has the dumbbell reaching")), None),
    ("G3b ... (the served logo)", ICONS, LOGO_FULL, LOGO_SHRUNK,
     command(E2E_ICON, failing_line("expect(header.reach).toBeGreaterThanOrEqual(1.2);"),
             step=GENERATE), None),

    # A changed icon reaches an installed app: versioned addresses, the manifest from the server.
    ("P1a each icon's address carries its content's hash (verify-build)", CONFIG,
     VERSIONED, PLAIN,
     command(VERIFY_BUILD, re.escape("manifest icon icons/icon-maskable-512.png must end ?v=")), None),
    ("P1b ... (the update check reads the new icon)", CONFIG, VERSIONED, PLAIN,
     command(E2E_UPDATE, re.escape("Error: the launcher icon comes from the server, not a kept copy")),
     None),
    ("P2a the plugin's manifest entry left out of the precache (verify-build)", CONFIG,
     LEFT_OUT, LEFT_IN, command(VERIFY_BUILD, NOT_PRECACHED), None),
    ("P2b ... (the update check reads the new manifest)", CONFIG, LEFT_OUT, LEFT_IN,
     command(E2E_UPDATE, MANIFEST_FROM_SERVER), None),
    ("P3 the precache's file list leaves the manifest out", CONFIG,
     "globPatterns: ['**/*.{js,css,html,svg,png,webp,ico}'],",
     "globPatterns: ['**/*.{js,css,html,svg,png,webp,ico,webmanifest}'],",
     command(VERIFY_BUILD, NOT_PRECACHED), None),
    ("P4a the manifest network first (verify-build)", CONFIG, NETWORK, CACHE,
     command(VERIFY_BUILD, NETWORK_FIRST), None),
    ("P4b ... (the update check reads the new manifest)", CONFIG, NETWORK, CACHE,
     command(E2E_UPDATE, MANIFEST_FROM_SERVER), None),
    ("P5a asked of the server past the browser's copy (verify-build)", CONFIG, NO_CACHE, "",
     command(VERIFY_BUILD, NETWORK_FIRST), None),
    ("P5b ... (the update check reads the new manifest)", CONFIG, NO_CACHE, "",
     command(E2E_UPDATE, MANIFEST_FROM_SERVER), None),
    ("P6 the route is the manifest's", CONFIG,
     r"            urlPattern: /\/manifest\.webmanifest$/,",
     r"            urlPattern: /\/manifest\.json$/,", command(VERIFY_BUILD, NETWORK_FIRST), None),
    ("P7 the app's identity: its id", CONFIG,
     "        id: base,", "        id: `${base}app`,",
     command(VERIFY_BUILD, re.escape("manifest id must be /Workout-Conductor-Rebuild-v4/")), None),
    # From the review, 2026-10-24: the page fallback leaves the manifest and the icons alone.
    ("P8 the manifest opens as itself under the worker", CONFIG,
     DENYLIST, r"        navigateFallbackDenylist: [/\/icons\//],",
     command(E2E_OPENED, failing_line("expect(opened?.headers()['content-type'] ?? '')")), None),
    ("P9 ... and a launcher icon", CONFIG,
     DENYLIST, r"        navigateFallbackDenylist: [/\/manifest\.webmanifest$/],",
     command(E2E_OPENED, failing_line("expect(icon?.headers()['content-type']).toBe('image/png');")),
     None),
]


def apply(original, old, new, nth):
    pairs = old if isinstance(old, list) else [(old, new)]
    mutated = original
    for part_old, part_new in pairs:
        count = mutated.count(part_old)
        if (nth is None and count != 1) or (nth is not None and count <= nth):
            return None, f"ANCHOR x{count}"
        at = -1
        for _ in range((nth or 0) + 1):
            at = mutated.index(part_old, at + 1)
        mutated = mutated[:at] + part_new + mutated[at + len(part_old):]
    return mutated, None


def icon_bytes():
    return {p: p.read_bytes() for p in (ROOT / "public" / "icons").glob("*.png")}


def last_lines(out, count=6):
    lines = [line for line in out.splitlines() if line.strip()]
    keep = [line for line in lines if re.search(r"Error|expect|failed|passed|FAILED|  - ", line)]
    return " | ".join((keep or lines)[-count:])[:900]


def run(cmd, env=None):
    return subprocess.run(
        cmd, shell=True, cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
        errors="replace", env=env,
    )


args = [arg for arg in sys.argv[1:] if not arg.startswith("--")]
check = "--check" in sys.argv
results = []
for name, rel, old, new, tests, nth in MUTATIONS:
    if args and not any(name.startswith(prefix) for prefix in args):
        continue
    path = ROOT / rel
    original = path.read_bytes().decode("utf-8")
    mutated, bad = apply(original, old, new, nth)
    if bad:
        results.append((name, bad, ""))
        print(f"{bad:9} {name}", flush=True)
        continue
    if check:
        continue
    icons = icon_bytes()
    try:
        path.write_bytes(mutated.encode("utf-8"))
        if isinstance(tests, dict):
            env = dict(os.environ, CI="1")
            stepped = ""
            if tests["step"]:
                stepped = f"step exit {run(tests['step'], env).returncode}; "
            done = run(tests["cmd"], env)
            out = done.stdout + done.stderr
            line = f"{stepped}exit {done.returncode}: {last_lines(out)}"
            if done.returncode == 0:
                verdict = "SURVIVED"
            elif re.search(tests["expect"], out):
                verdict = "KILLED"
            else:
                verdict = "WRONG FAILURE"
        else:
            done = run("npx vitest run " + " ".join(tests))
            out = done.stdout + done.stderr
            summary = re.search(r"Tests\s+(.*)", out)
            line = summary.group(1).strip() if summary else "no summary (compile error?)"
            asserted = re.search(r"AssertionError|TestingLibraryElementError|expected .* to ", out)
            if summary is None:
                verdict = "WRONG FAILURE"
            elif "failed" not in line:
                verdict = "SURVIVED"
            elif re.search(r"Test timed out", out) and not asserted:
                verdict = "WRONG FAILURE"
            else:
                verdict = "KILLED"
        results.append((name, verdict, line))
    finally:
        path.write_bytes(original.encode("utf-8"))
        for icon, data in icons.items():
            icon.write_bytes(data)
    print(f"{results[-1][1]:9} {name}: {results[-1][2]}", flush=True)

if check:
    print(f"anchors checked: {len(MUTATIONS)} entries, {len(results)} not found")
    sys.exit(0)
print("\n==== summary")
for name, verdict, line in results:
    print(f"{verdict:9} {name}  [{line}]")
missed = [r for r in results if r[1] != "KILLED"]
print(f"\n{len(results) - len(missed)} killed, {len(missed)} not killed")
