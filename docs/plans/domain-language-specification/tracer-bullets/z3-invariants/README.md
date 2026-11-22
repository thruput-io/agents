# Tracer Bullet: Docker Z3 Verification of RFC 0001 (`uql`) Invariants

This tracer bullet proves the mathematical invariants of [`docs/rfcs/0001-ubiquitous-language.md`](../../../../rfcs/0001-ubiquitous-language.md) inside a self-contained Docker container running `z3 -smt2`:

1. **Invariant 1 (Well-Definedness — `UQL001`–`UQL004`)**: Proves that `|R(w)| = 1 ∧ |A(p)| = 1 ∧ |T(s)| = 1` is mutually exclusive (`unsat`) with `UQL001` (`|R(w)| = 0`) and `UQL002`–`UQL004` (`> 1`).
2. **Invariant 3 (Logical Independence & Minimality — `UQL005`–`UQL006`)**: Proves independence (`sat` of both `S2 ∧ ¬S4` and `S4 ∧ ¬S2`) and proves `UQL005` redundancy detection (`unsat` of `D ∧ ¬S1` with unsat core `(D_unit_test_def neg_S1_redundant)`).
3. **Invariant 4 (Satisfiability / No Contradiction — `UQL007`)**: Proves `UQL007` contradiction detection (`unsat` with minimal unsat core `(active_maintenance_window S5_retry_in_window S6_never_retry)`).
4. **Invariant 5 (Finite Closure)**: Proves visited-set termination in `<= |V|` steps (`unsat` for `|V| + 1` unvisited transitions).
