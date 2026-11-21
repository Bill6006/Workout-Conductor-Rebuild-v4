"""Rewrite mutate-final-polish.py's table from table_final_polish.txt (edit the .txt, then run this).

Never write the table through a shell heredoc: heredocs collapse the table's backslashes.
"""
import pathlib

p = pathlib.Path(__file__).resolve().parent / "mutate-final-polish.py"
t = p.read_bytes().decode("utf-8")
start = t.index("# (name, file, old, new, tests, nth)")
end = t.index("def apply(original, old, new, nth):")
head = t[:start]
tail = t[end:]
table = (pathlib.Path(__file__).parent / "table_final_polish.txt").read_bytes().decode("utf-8")
p.write_bytes((head + table + "\n\n" + tail).encode("utf-8"))
print("written")
