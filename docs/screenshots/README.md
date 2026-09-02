# Screenshots

Real screenshots captured from the built application by Playwright. Mockups are never used as
completion evidence.

Each phase with a visible UI change gets a folder `phase-<n>/` containing:

- `android-412-<screen>.png` (Pixel 7 emulation, 412 x 915)
- `android-360-<screen>.png` (narrow phone, 360 x 800)
- `desktop-<screen>.png` (1280 x 800)
- `preview-sheet.png` (combined sheet of the above)
- feature-specific captures required by the plan for that phase (calibration overlay, active
  workout, set logging, alternatives, and so on) once those features exist

Regenerate with:

```bash
npm run build && npm run screenshots -- --phase <n>
```

Screenshots are refreshed only when the visible UI changed.
