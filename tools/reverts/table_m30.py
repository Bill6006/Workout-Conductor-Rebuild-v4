"""Rewrite mutate-m30.py's table from table_m30.txt (edit the .txt, then run this).

Never write the table through a shell heredoc: heredocs collapse the table's backslashes.
"""
import pathlib

p = pathlib.Path(__file__).resolve().parent / "mutate-m30.py"
t = p.read_bytes().decode("utf-8")
start = t.index("# (name, file, old, new, tests, nth)")
end = t.index("def apply(original, old, new, nth):")
head = t[:start]
tail = t[end:]
if 'STORE = ' not in head:
    head = head.replace(
        'SETTINGS = "src/features/settings/SettingsScreen.tsx"\n',
        'SETTINGS = "src/features/settings/SettingsScreen.tsx"\n'
        'STORE = "src/core/state/appStore.ts"\n'
        'AUTOSAVE = "src/features/profile/useProfileEditor.ts"\n'
        'DEFINE = "src/catalog/exercises/define.ts"\n'
        'CUSTOM = "src/core/validation/customExercise.ts"\n',
    )

table = (pathlib.Path(__file__).parent / "table_m30.txt").read_bytes().decode("utf-8")
p.write_bytes((head + table + "\n\n" + tail).encode("utf-8"))
print("written")
