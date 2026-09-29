# Rationale sources for the principles

Research of 2026-09-27, four agents, web only. Each principle has a draft rationale in the form of The Twelve-Factor App: a title, then the mechanism by which following the principle delivers faster and more reliably than the shortcut. Weighing between principles is left for later. Unverified claims are marked.

## Purpose and ladders

### Every part of the code solves part of the stated WHY for its users, and no part reaches outside it

**Every line serves the users' WHY.** Code outside the stated purpose is not free. Fowler's *Yagni* names four costs: building it, delaying real features, carrying its complexity, and repairing it when the guess proves wrong. The Poppendiecks list extra features among the seven wastes of software development. Jeffries: "the best way to have fewer bugs is to implement less code." Keeping every part inside the WHY keeps the codebase small enough to understand and change quickly, and every test and review aimed at what users need.

- Ron Jeffries, *You're NOT Gonna Need It*, 1998 — https://ronjeffries.com/xprog/articles/practices/pracnotneed/
- Martin Fowler, *Yagni*, 2015 — https://martinfowler.com/bliki/Yagni.html (credits Kent Beck and Chet Hendrickson, C3)
- Poppendieck, *Lean Software Development*, 2003 — unverified, secondary summaries only
- Critique: Fowler — YAGNI never excuses skipping refactoring and tests.

### Every rung below the first must prove that the rungs above it cannot serve

**Descend only when the rung above cannot serve.** Every rung down adds ownership cost and failure modes. McKinley's *Choose Boring Technology*: each new component spends a scarce innovation token and brings unknown failures; Twelve-Factor II makes every dependency an explicit, owned declaration. For correctness, Minsky's "make illegal states unrepresentable" and King's *Parse, don't validate* remove classes of bugs before a test exists; the *Practical Test Pyramid*: push tests as far down as you can. Higher rungs give faster, more precise feedback and less to maintain.

- Dan McKinley, *Choose Boring Technology*, 2015 — https://mcfunley.com/choose-boring-technology
- The Twelve-Factor App, II. Dependencies, 2011 — https://12factor.net/dependencies
- Yaron Minsky, *Effective ML Revisited*, 2011 — https://blog.janestreet.com/effective-ml-revisited/
- Alexis King, *Parse, don't validate*, 2019 — https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/
- Ham Vocke, *The Practical Test Pyramid*, 2018 — https://martinfowler.com/articles/practical-test-pyramid.html
- Larry Smith, *Shift-Left Testing*, 2001 — https://jacobfilipp.com/DrDobbs/articles/DDJ/2001/0109/0109e/0109e.htm
- Critique: the 10×/100× cost-of-defect multipliers rest on weak evidence (Bossavit, *The Leprechauns of Software Engineering*, 2015 — unverified, secondary). Argue from feedback speed and precision, not multipliers.

## Convention and intent

### Structure follows convention; novelty belongs in the solution

**Convention over invention.** Code is read far more often than it is written (PEP 8) and maintained by people who did not write it. Following ecosystem conventions and the surrounding code lets a reader predict structure instead of decoding it — least astonishment. Rails: conventions remove the mundane decisions so effort goes to what is new. Google's review guidance makes it checkable: the style guide rules, and failing that, the existing code. Point to the convention; do not recall it.

- DHH, *The Rails Doctrine*, 2016 — https://rubyonrails.org/doctrine#convention-over-configuration
- PEP 8, *A Foolish Consistency…*, 2001 — https://peps.python.org/pep-0008/#a-foolish-consistency-is-the-hobgoblin-of-little-minds
- Google Engineering Practices, *What to look for in a code review* — https://google.github.io/eng-practices/review/reviewer/looking-for.html (year unverified)
- Critique: DHH — knowing when to break convention is the hard part; convention can entrench outdated patterns.

### What a comment would carry belongs in a durable, verifiable place

**Intent lives where it is checked.** A comment is unverified prose that drifts from its code (Martin, *Clean Code*). Put the knowledge where drift is caught: a name at every call site, a failing test for unfinished work, an Architecture Decision Record for the why of a design (Nygard), a README for usage. Nygard shows the cost of losing the why: teams blindly accept a decision or blindly reverse it. Ousterhout objects that some intent cannot be code; ADRs and interface docs hold it.

- Robert C. Martin, *Clean Code*, ch. 4, 2008 — paywalled, quotes confirmed only through secondary sources
- Michael Nygard, *Documenting Architecture Decisions*, 2011 — https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- Google Engineering Practices, *Comments* — https://google.github.io/eng-practices/review/reviewer/looking-for.html#comments
- Counterpoint: Ousterhout and Martin, *APoSD vs Clean Code*, 2024–25 — https://github.com/johnousterhout/aposd-vs-clean-code/blob/main/README.md#comments

### Each concern is owned by one component in one layer

**One concern, one owner.** Dijkstra named separation of concerns the only reliable way to order one's thoughts; Parnas made it structural: each module hides one decision likely to change. When a behaviour has one owner in one layer, changing it touches one place and one set of tests. Scattering it saves minutes today and costs a hunt, and a missed copy, on every future change. Twelve-Factor's Config applies the same rule to deployment.

- Edsger W. Dijkstra, *On the role of scientific thought* (EWD447), 1974 — https://www.cs.utexas.edu/~EWD/transcriptions/EWD04xx/EWD447.html
- David L. Parnas, *On the Criteria To Be Used in Decomposing Systems into Modules*, CACM 1972 — https://dl.acm.org/doi/10.1145/361598.361623 (text not fetched; quote unverified)
- The Twelve-Factor App, III. Config — https://12factor.net/config
- Critique: over-fine separation adds indirection (Ousterhout, shallow modules).

## Failure and boundaries

### Fail loudly and immediately on an unexpected state

**Crash, don't guess.** A program that continues past an unexpected state runs on a guess. Shore's *Fail Fast*: code that works around errors fails mysteriously later; code that stops at once reveals the defect where it lives. Armstrong's Erlang thesis: skip the defensive code, let the process die, recover elsewhere. RFC 9413: tolerated faults become permanent contracts. Twelve-Factor's Disposability makes crashing safe. Discarded exit codes and fallback defaults are exactly these guesses.

- Jim Shore, *Fail Fast*, IEEE Software, 2004 — https://www.jamesshore.com/v2/blog/2004/fail-fast
- Joe Armstrong, PhD thesis, 2003 — https://erlang.org/download/armstrong_thesis_2003.pdf (wording unverified)
- Thomson and Schinazi, RFC 9413, 2023 — https://www.rfc-editor.org/rfc/rfc9413.html
- The Twelve-Factor App, IX. Disposability — https://12factor.net/disposability
- Critique: "let it crash" assumes a supervisor and isolated state; without them a crash can lose work.

### Fold a foreign shape into ours at the perimeter

**Translate at the door.** Code we do not control speaks its own dialect. Cockburn's Hexagonal Architecture and Evans's Anti-Corruption Layer both put translation at a port, so foreign models never leak inward. King's *Parse, don't validate* says why: parse once at the boundary into types that cannot hold illegal states, and the rest never re-checks. Hoare's billion-dollar mistake shows the cost of uncertainty travelling through every reference. One adapter per foreign shape keeps upgrades local.

- Alistair Cockburn, *Hexagonal Architecture*, 2005 — https://alistair.cockburn.us/hexagonal-architecture/
- Eric Evans, *Domain-Driven Design*, Anti-Corruption Layer, 2003 — secondary: https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer
- Alexis King, *Parse, don't validate*, 2019 — https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/
- Tony Hoare, *Null References: The Billion Dollar Mistake*, 2009 — https://www.infoq.com/presentations/Null-References-The-Billion-Dollar-Mistake-Tony-Hoare/
- Critique: a translation layer costs latency and upkeep; it is overhead where the shapes already match.

### Every option combination gets its own name

**Name the case, not the knob.** Each optional flag doubles a function's paths — Hodgson's combinatoric explosion — and most are never tested. Fowler's *FlagArgument*: a named method states intent where a bare boolean hides it. Harper's *Boolean Blindness*: a flag carries no meaning of its own. Name each allowed combination, as Minsky's "make illegal states unrepresentable" suggests; where a framework forces optionality on us, fold it at the perimeter.

- Martin Fowler, *FlagArgument*, 2011 — https://martinfowler.com/bliki/FlagArgument.html
- Robert Harper, *Boolean Blindness*, 2011 — https://existentialtype.wordpress.com/2011/03/15/boolean-blindness/
- Pete Hodgson, *Feature Toggles*, 2017 — https://martinfowler.com/articles/feature-toggles.html
- Critique: Fowler accepts a private flagged method behind named public wrappers. Do not cite Twelve-Factor III here: its answer to config explosion is granular variables, the opposite direction.

## Verification and contracts

### A change is done when a test shows the behaviour and fails when it breaks

**Tests prove behaviour, not execution.** A line that runs under test is not a line that is checked. Fowler's *AssertionFreeTesting* describes suites with full coverage that verified nothing; Inozemtseva and Holmes found coverage predicts little about fault detection once suite size is controlled for. Google's mutation-testing work asks the question that matters: does a test fail when the code is wrong? A test that asserts outcomes is an executable specification that documents and guards behaviour on every commit.

- Martin Fowler, *AssertionFreeTesting*, 2004 — https://martinfowler.com/bliki/AssertionFreeTesting.html
- Martin Fowler, *TestCoverage*, 2012 — https://martinfowler.com/bliki/TestCoverage.html
- Inozemtseva and Holmes, ICSE 2014 — https://www.cs.ubc.ca/~rtholmes/papers/icse_2014_inozemtseva.pdf
- Petrović and Ivanković, *State of Mutation Testing at Google*, 2018 — https://research.google.com/pubs/archive/46584.pdf

### The quality bar is defined once, in the build, and never weakened

**Make the wrong thing fail.** Documents advise; the build decides. Following Fowler's *Continuous Integration*, compiler strictness, linters and thresholds live in the self-testing build, where every change, human or agent, meets the same bar. Like Toyota's jidoka, an abnormality stops the line instead of travelling downstream. A gate that is relaxed, or quietly stops measuring, is Hunt and Thomas's broken window: it tells everyone the standard is gone. Fix the code, never the check.

- Martin Fowler, *Continuous Integration*, 2006, revised 2024 — https://martinfowler.com/articles/continuousIntegration.html#FixBrokenBuildsImmediately
- Toyota, *Toyota Production System* (jidoka) — https://global.toyota/en/company/vision-and-philosophy/production-system/index.html
- Hunt and Thomas, *The Pragmatic Programmer*, Software Entropy, 1999 — third-party excerpt only
- The Twelve-Factor App, V. Build, release, run — https://12factor.net/build-release-run (partial fit)

### The producer moves first; consumers accept what they do not know

**Evolve contracts additively.** The producer ships the expanded contract first; consumers ignore fields they do not understand and migrate later. This is Sato's *Parallel Change* across a boundary, made safe by Robinson's "Must Ignore" and Fowler's *Tolerant Reader*. Each side deploys and rolls back independently. Tolerance is limited to declared extension points: RFC 9413 shows that accepting malformed input entrenches defects. Ignore the unknown, reject the invalid.

- Ian Robinson, *Consumer-Driven Contracts*, 2006 — https://martinfowler.com/articles/consumerDrivenContracts.html
- Martin Fowler, *TolerantReader*, 2011 — https://martinfowler.com/bliki/TolerantReader.html
- Danilo Sato, *ParallelChange*, 2014 — https://martinfowler.com/bliki/ParallelChange.html
- Critique: Thomson and Schinazi, RFC 9413, 2023, §4 — https://www.rfc-editor.org/rfc/rfc9413.html#section-4
