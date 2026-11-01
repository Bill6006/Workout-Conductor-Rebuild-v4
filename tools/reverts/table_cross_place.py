"""Rewrite mutate-cross-place.py's table from table_cross_place.txt (edit the .txt, then run this).

Never write the table through a shell heredoc: heredocs collapse the table's backslashes.
"""
import pathlib

p = pathlib.Path(__file__).resolve().parent / "mutate-cross-place.py"
t = p.read_bytes().decode("utf-8")
start = t.index("# (name, file, old, new, tests, nth)")
end = t.index("def apply(original, old, new, nth):")
head = t[:start]
tail = t[end:]
table = (pathlib.Path(__file__).parent / "table_cross_place.txt").read_bytes().decode("utf-8")
p.write_bytes((head + table + "\n\n" + tail).encode("utf-8"))
print("written")
