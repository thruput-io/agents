# Tracer bullet: orval mocks in a folder of their own

Question: when orval writes the MSW mocks to a folder of their own, does the mock file import the generated client
with its file extension, so that the type check and native modules resolve it? The same client is generated twice:
once with orval finding the tsconfig by itself and once with the tsconfig named in the orval configuration.

Run from this folder:

    docker build -t orval-mock-folder . && docker run --rm orval-mock-folder

The result is recorded in `RESULT.md`.
