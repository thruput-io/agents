FROM alpine:3.20
RUN apk add --no-cache z3
WORKDIR /work
COPY invariants.smt2 /work/invariants.smt2
CMD ["z3", "-smt2", "/work/invariants.smt2"]
