# Tracer bullet: the context of a change, found by a program

Question: can the call sites into a change, and the definitions it calls out to, be found without an agent and without
building the project, in TypeScript, Python, Go, C# and Bash?

`repo/` holds the same small program in each language: `shipping` defines the changed function, `order` calls it and
also names it in a comment and in a string, `rates` defines what the changed function calls, and a test file calls it.

`run.sh` asks ast-grep for the calls named in `calls.tsv` and universal-ctags for the definitions it calls, and
compares the answer with `expected.txt`. It fails when they differ.

Run it with `docker build --tag context-by-ast-grep . && docker run --rm context-by-ast-grep`.
