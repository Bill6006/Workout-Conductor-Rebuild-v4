"""Rewrite mutate-m33.py's table from table_m33.txt (edit the .txt, then run this).

Never write the table through a shell heredoc: heredocs collapse the table's backslashes.
"""
import pathlib

p = pathlib.Path(__file__).resolve().parent / "mutate-m33.py"
t = p.read_bytes().decode("utf-8")
start = t.index("# (name, file, old, new, tests, nth)")
end = t.index("def apply(original, old, new, nth):")
head = t[:start]
tail = t[end:]
table = (pathlib.Path(__file__).parent / "table_m33.txt").read_bytes().decode("utf-8")
p.write_bytes((head + table + "\n\n" + tail).encode("utf-8"))
print("written")
