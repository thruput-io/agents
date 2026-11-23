# Tracer bullet: package visibility as the lock

Question: if the domain interfaces, the friend module and the codecs live in one package, do the package's entry points
keep every other package out of the friend module, at compile time and at runtime? And can package declarations keep
the controller away from the codecs?

Four packages in one npm workspace: `core` holds the interfaces, the friend module and the codecs; `domain` re-exports
the interfaces as types; `controller` declares only `domain`; `client` declares `core` and `controller`.

Run from this folder:

    docker build -t package-visibility . && docker run --rm package-visibility

The result is recorded in `RESULT.md`.
