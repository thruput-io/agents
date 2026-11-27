# Checklist

The agent runs this on its own diff before every push. Each entry is a habit found in this code on 2026-11-27, the
rule it breaks, and the solution. The diff passes when every answer is no. The checklist does not replace the human
review.

A solution in quotes is taken word for word from the constitution, with its source. A solution tagged `(review)` is
written by the agent, because the constitution gives none, and waits for the human to judge it.

## Shapes

1. **Does the diff add an `interface`, a `type` or a Zod shape by hand for something that crosses a boundary?**
   - Breaks: [[Shapes live in the contract]], [[No second representation]]
   - Solution: "Generate both sides of a boundary from the contract rather than write either by hand."
     ([[Agree at the boundary]])

2. **Does the diff use the result of `JSON.parse`, or call `JSON.stringify`, on a shape that no [[Contract]]
   describes?**
   - Breaks: [[Shapes live in the contract]]
   - Solution: "Parse raw input once, at the [[Perimeter]], through the [[Validating path of creation]], and pass the
     type on; never check a primitive and pass the primitive on." ([[Parse, don't validate]])

3. **Does the diff write source code from strings, or add a script that generates?**
   - Breaks: [[No new code where an external tool serves]]
   - Solution: "Derive secondary artifacts from the authoritative [[Representation]] in the build rather than
     maintaining copies by hand." ([[Duplication drifts]])
   - Solution `(review)`: the build invokes Orval, and the configuration of Orval points to the [[Contract]].

## Domain

4. **Does a file in the domain import Zod, hold a codec, or name a stored or wire value?**
   - Breaks: [[Domain separated from transport and framework]]
   - Solution: "The [[Foreign shape]] is folded into an [[Encapsulated type]] at the [[Perimeter]] and back only there.
     Inward of that point nothing sees it." ([[Fold at Perimeter]])

5. **Does a [[Domain method]] return a plain object with readable fields, a boolean, a number or a string?**
   - Breaks: [[Opaque encapsulated types]], [[Domain-only interfaces]], [[Wrap primitives]]
   - Solution: "Hide a type's representation outside its defining module, as a new type or a branded type, rather than
     share it through an alias, so values that share a representation but not a meaning cannot be mixed."
     ([[Encapsulation]])
   - Solution: "Implement the language's comparison interface on a [[Domain object]] rather than compare its
     primitives." ([[Encapsulation]])

6. **Does a [[Domain object]] have a second way to be created beside its [[Factory]]?**
   - Breaks: [[Validating factory]]
   - Solution: "Use every typing add-on the language offers to give every type one [[Validating path of creation]] and
     no other." ([[Encapsulation]])

7. **Does a caller read `.length`, `.some(...)`, a predicate or `instanceof` and then decide what to do?**
   - Breaks: [[Tell, don't ask]], [[Branching belongs at the perimeter]]
   - Solution: "Tell a [[Domain object]] what action to perform through a [[Domain method]] rather than querying its
     state to branch in the caller." ([[Polymorphism over conditionals]])

8. **Is a state held as a number, a sentinel, a boolean or the size of a collection?**
   - Breaks: [[Closed enumerations]]
   - Solution: "Encode a state machine in the type, each transition consuming the old state's type and returning the
     new one, so an operation invalid in the current state does not typecheck." ([[Encapsulation]])
   - Solution: "Enforce a collection's invariants in its type: a non-empty list makes `head` and `max` total, and a
     first-class collection enforces uniqueness, bounds, and ordering in one place." ([[Encapsulation]])

9. **Does an [[Aggregate]] accept a change that a caller was supposed to check first?**
   - Breaks: [[Self-guarding aggregates]]
   - Solution: "Route every state change of an [[Aggregate]] through a [[Domain method]] that re-establishes its
     [[Invariant]]s." ([[Self-guarding aggregates]])

10. **Is a failure created only to be matched straight back, or turned into a success or an empty value?**
    - Breaks: [[Branching belongs at the perimeter]], [[No default on failure]]
    - Solution `(review)`: give the state that allows the operation a type of its own, so the operation exists only on
      that type and no failure is made to be undone. A failure that is real travels unchanged to the [[Perimeter]].

## Failures

11. **Does a `catch` build a failure and drop the cause?**
    - Breaks: [[No discarded diagnostics]]
    - Solution `(review)`: let the failing tool's own [[Error output]] reach the user at the [[Perimeter]], beside the
      failure the domain defines.

## Tests

12. **Does an assertion check `instanceof`, `typeof`, a length or `includes` where the value itself can be compared?**
    - Breaks: [[Assert values]], [[No check the type system makes]]
    - Solution: "A test counts only once it has failed for the behaviour it checks; a test that cannot fail checks
      nothing." ([[Never trust a test you haven't seen fail]])
    - Solution: "Implement the language's comparison interface on a [[Domain object]] rather than compare its
      primitives." ([[Encapsulation]])

13. **Does a [[Unit test]] build or observe its subject through another object, or through the whole stack?**
    - Breaks: [[One subject under test]]
    - Solution: "Treat painful [[Test setup]] as a design signal: split the subject into smaller domain models or
      focused interfaces before reaching for a mock." ([[Tests prove behavior, not execution]])

14. **Does a [[Test]] repeat a literal or a stand-in that test support already holds?**
    - Breaks: [[No second representation]]
    - Solution `(review)`: take the value from the one test-support file that holds it, and add it there when it is
      missing.

## Guardrails

15. **Does the diff change a guarded file, a ceiling or a lint setting, or add a check that passes on nothing?**
    - Breaks: [[Obligation to report]]
    - Solution: "Report any spotted weakening of [[Guardrails Against Doing the Wrong Thing]] **on detection**—not
      later, never finishing a task before or delaying in any other way—and make sure via explicit confirmation from
      the human, as every [[Developer]]'s human or non-human responsibility." ([[Obligation to report]])
    - Solution: "Resolve a [[Static code analysis]] warning at its root cause; where the code cannot satisfy a strict
      rule, seek architectural guidance, never a workaround." ([[Make the wrong thing fail]])
