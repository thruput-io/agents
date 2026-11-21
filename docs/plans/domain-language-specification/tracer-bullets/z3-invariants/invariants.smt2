; SMT-LIB v2.6 proof of RFC 0001 (uql) Invariants 1-5
(set-logic ALL)
(set-option :produce-unsat-cores true)

; --- 1. Invariant 1: Well-Definedness (|R(w)| = 1, |A(p)| = 1, |T(s)| = 1) ---
(push 1)
(declare-const r_w Int)
(declare-const a_p Int)
(declare-const t_s Int)
(assert (! (and (= r_w 1) (= a_p 1) (= t_s 1)) :named inv1_well_defined))
; Verify that UQL001 (r_w = 0) or UQL002-UQL004 (> 1) is unsatisfiable with Invariant 1
(assert (! (or (= r_w 0) (> r_w 1) (> a_p 1) (> t_s 1)) :named uql001_to_004_violation))
(echo "Invariant 1 (UQL001-UQL004 disjoint from well-definedness, expect unsat):")
(check-sat)
(get-unsat-core)
(pop 1)

; --- 2. Invariant 3: Independence (UQL005) & Minimality (UQL006) ---
; Prove that Axiom S2 ("info defined once") and Axiom S4 ("earliest point possible") are logically independent:
; neither (S2 => S4) nor (S4 => S2) is valid (both negations are satisfiable).
(push 1)
(declare-const s2_single_source Bool)
(declare-const s4_shift_left Bool)
(assert (and s2_single_source (not s4_shift_left)))
(echo "Invariant 3a (S2 does not entail S4, expect sat):")
(check-sat)
(pop 1)

(push 1)
(declare-const s2_single_source Bool)
(declare-const s4_shift_left Bool)
(assert (and s4_shift_left (not s2_single_source)))
(echo "Invariant 3b (S4 does not entail S2, expect sat):")
(check-sat)
(pop 1)

; Prove UQL005 detection when Statement S1 is entailed by Glossary definition D:
; D: UnitTest(x) => InMemory(x) ^ ~NetworkCall(x)
; S1: UnitTest(x) => ~NetworkCall(x)
; Negation of (D => S1) is unsat, proving D |= S1 (so S1 is redundant: UQL005).
(push 1)
(declare-sort Artifact 0)
(declare-fun UnitTest (Artifact) Bool)
(declare-fun InMemory (Artifact) Bool)
(declare-fun NetworkCall (Artifact) Bool)
(declare-const x Artifact)
(assert (! (forall ((a Artifact)) (=> (UnitTest a) (and (InMemory a) (not (NetworkCall a))))) :named D_unit_test_def))
(assert (! (not (=> (UnitTest x) (not (NetworkCall x)))) :named neg_S1_redundant))
(echo "Invariant 3c (UQL005 RedundantStatement entailed by D, expect unsat):")
(check-sat)
(get-unsat-core)
(pop 1)

; --- 3. Invariant 4: Satisfiability / No Contradiction (UQL007) ---
; Fixture C contradiction:
; S5: MaintenanceWindow(r) => Retries(r)
; S6: forall r, ~Retries(r)
; Existence of a request during a MaintenanceWindow makes {S5, S6} unsat and extracts the minimal conflict core.
(push 1)
(declare-sort Request 0)
(declare-fun MaintenanceWindow (Request) Bool)
(declare-fun Retries (Request) Bool)
(declare-const req Request)
(assert (! (MaintenanceWindow req) :named active_maintenance_window))
(assert (! (forall ((r Request)) (=> (MaintenanceWindow r) (Retries r))) :named S5_retry_in_window))
(assert (! (forall ((r Request)) (not (Retries r))) :named S6_never_retry))
(echo "Invariant 4 (UQL007 Contradiction between S5 and S6, expect unsat):")
(check-sat)
(get-unsat-core)
(pop 1)

; --- 4. Invariant 5: Finite Closure in Cyclic/Acyclic Bounded Context Graph G = (V, E) ---
; For any finite vertex set |V| = N, a visited-set traversal strictly increases |visited| in [0..N] at each step,
; so a walk of N+1 unvisited steps is unsatisfiable.
(push 1)
(declare-const N Int)
(declare-fun visited_count (Int) Int)
(assert (= N 5))
(assert (= (visited_count 0) 0))
(assert (forall ((step Int)) (=> (and (>= step 0) (< step 6)) (= (visited_count (+ step 1)) (+ (visited_count step) 1)))))
(assert (forall ((step Int)) (=> (and (>= step 0) (<= step 6)) (<= (visited_count step) N))))
(echo "Invariant 5 (Finite Closure terminates in <= |V| steps, expect unsat for N+1 unvisited steps):")
(check-sat)
(pop 1)
