# 📚 Agent Rules & Skills Index

This directory serves as a **smart search index** and curated guide for the ready-to-use rule sets and skills distilled from classic software engineering books. These rules are explicitly formulated as lightweight, actionable engineering instructions to guide AI coding assistants (like Cursor, Codex, Claude Code, etc.) in writing, refactoring, and reviewing code.

> [!TIP]
> **Why use these?** Listing concrete engineering rules from specific books is proven to be significantly more effective than simply naming a book in your prompts (e.g., scoring **74/100** vs. **46/100** in architectural quality during comparative refactoring experiments).

---

## 🎯 Navigating the Rulesets by Focus

Choose the ruleset that matches the immediate phase or technical profile of your project:

### 🏛️ Domain Modeling & Strategic Architecture
*For designing deep, domain-centric business logic and maintaining boundary integrity.*

*   **[Domain-Driven Design (Eric Evans)](https://github.com/ciembor/agent-rules-books/tree/main/domain-driven-design)**  
    *Strategic & Tactical modeling. Solves database/controller leakage into business rules.*  
    📂 Link: [Canonical Full Ruleset](https://github.com/ciembor/agent-rules-books/blob/main/domain-driven-design/domain-driven-design.md)
*   **[Implementing Domain-Driven Design (Vaughn Vernon)](https://github.com/ciembor/agent-rules-books/tree/main/implementing-domain-driven-design)**  
    *Real-world tactical patterns: Aggregates, Domain Events, and Application Services.*  
    📂 Link: [Canonical Full Ruleset](https://github.com/ciembor/agent-rules-books/blob/main/implementing-domain-driven-design/implementing-domain-driven-design.md)
*   **[Domain-Driven Design Distilled (Vaughn Vernon)](https://github.com/ciembor/agent-rules-books/tree/main/domain-driven-design-distilled)**  
    *Lightweight, high-impact tactical patterns with minimal ceremony.*  
    📂 Link: [Canonical Full Ruleset](https://github.com/ciembor/agent-rules-books/blob/main/domain-driven-design-distilled/domain-driven-design-distilled.md)
*   **[Clean Architecture (Robert C. Martin)](https://github.com/ciembor/agent-rules-books/tree/main/clean-architecture)**  
    *Stable boundaries, the dependency rule, and keeping frameworks decoupled from business policies.*  
    📂 Link: [Canonical Full Ruleset](https://github.com/ciembor/agent-rules-books/blob/main/clean-architecture/clean-architecture.md)
*   **[Patterns of Enterprise Application Architecture (Martin Fowler)](https://github.com/ciembor/agent-rules-books/tree/main/patterns-of-enterprise-application-architecture)**  
    *Enforcing clear data access, application-logic, and presentation layers.*  
    📂 Link: [Canonical Full Ruleset](https://github.com/ciembor/agent-rules-books/blob/main/patterns-of-enterprise-application-architecture/patterns-of-enterprise-application-architecture.md)

### ✍️ Code Craftsmanship & Module Design
*For day-to-day coding, API design, class design, and maintaining deep readability.*

*   **[A Philosophy of Software Design (John Ousterhout)](https://github.com/ciembor/agent-rules-books/tree/main/a-philosophy-of-software-design)**  
    *Deep modules, simple interfaces, low cognitive load, and strategic vs. tactical design.*  
    📂 Link: [Canonical Full Ruleset](https://github.com/ciembor/agent-rules-books/blob/main/a-philosophy-of-software-design/a-philosophy-of-software-design.md)
*   **[Clean Code (Robert C. Martin)](https://github.com/ciembor/agent-rules-books/tree/main/clean-code)**  
    *Readability, meaningful naming conventions, tiny functions, and clean exception handling.*  
    📂 Link: [Canonical Full Ruleset](https://github.com/ciembor/agent-rules-books/blob/main/clean-code/clean-code.md)
*   **[Code Complete (Steve McConnell)](https://github.com/ciembor/agent-rules-books/tree/main/code-complete)**  
    *General software construction: variables, loops, control flow, and disciplined design decision-making.*  
    📂 Link: [Canonical Full Ruleset](https://github.com/ciembor/agent-rules-books/blob/main/code-complete/code-complete.md)
*   **[The Pragmatic Programmer (Andrew Hunt & David Thomas)](https://github.com/ciembor/agent-rules-books/tree/main/the-pragmatic-programmer)**  
    *DRY (Don't Repeat Yourself), orthogonality, automation, fast feedback loops, and agility.*  
    📂 Link: [Canonical Full Ruleset](https://github.com/ciembor/agent-rules-books/blob/main/the-pragmatic-programmer/the-pragmatic-programmer.md)

### ⚡ Refactoring & Legacy Codebases
*For safely modifying, cleaning, and restructuring existing systems.*

*   **[Refactoring (Martin Fowler)](https://github.com/ciembor/agent-rules-books/tree/main/refactoring)**  
    *Systematic code transformations, identifying code smells, and taking precise micro-steps with tests.*  
    📂 Link: [Canonical Full Ruleset](https://github.com/ciembor/agent-rules-books/blob/main/refactoring/refactoring.md)
*   **[Refactoring.Guru](https://github.com/ciembor/agent-rules-books/tree/main/refactoring-guru)**  
    *Practical refactoring processes, Design Patterns mapping, and diagnostic treatment of smells.*  
    📂 Link: [Canonical Full Ruleset](https://github.com/ciembor/agent-rules-books/blob/main/refactoring-guru/refactoring-guru.md)
*   **[Working Effectively with Legacy Code (Michael Feathers)](https://github.com/ciembor/agent-rules-books/tree/main/working-effectively-with-legacy-code)**  
    *Breaking dependencies, establishing seams, writing characterization tests, and mitigating change risks.*  
    📂 Link: [Canonical Full Ruleset](https://github.com/ciembor/agent-rules-books/blob/main/working-effectively-with-legacy-code/working-effectively-with-legacy-code.md)

### 🌐 High Availability, Data, & Production Resilience
*For services handling persistence, distributed state, networks, and production faults.*

*   **[Designing Data-Intensive Applications (Martin Kleppmann)](https://github.com/ciembor/agent-rules-books/tree/main/designing-data-intensive-applications)**  
    *Reliability, schemas, partition/replication strategies, and consistency trade-offs.*  
    📂 Link: [Canonical Full Ruleset](https://github.com/ciembor/agent-rules-books/blob/main/designing-data-intensive-applications/designing-data-intensive-applications.md)
*   **[Release It! (Michael T. Nygard)](https://github.com/ciembor/agent-rules-books/tree/main/release-it)**  
    *Resilience patterns: circuit breakers, bulkheads, timeouts, retries, and production observability.*  
    📂 Link: [Canonical Full Ruleset](https://github.com/ciembor/agent-rules-books/blob/main/release-it/release-it.md)

---

## ⚡ Quick-Reference Selection Matrix

Use the matrix below to choose the optimal ruleset:

| Ruleset Focus / Book | Key Agent Directives | Recommended File |
| :--- | :--- | :--- |
| **API & Module Depth**<br>_A Philosophy of Software Design_ | Fight shallow classes, maximize information hiding, minimize cognitive load. | [APoSD Full](https://github.com/ciembor/agent-rules-books/blob/main/a-philosophy-of-software-design/a-philosophy-of-software-design.md) |
| **Core Architecture Boundaries**<br>_Clean Architecture_ | Isolate frameworks, strictly enforce the dependency rule, decouple logic from DB. | [Clean Arch Full](https://github.com/ciembor/agent-rules-books/blob/main/clean-architecture/clean-architecture.md) |
| **Day-to-day Cleanliness**<br>_Clean Code_ | Descriptive naming, single-responsibility functions, readable error handling. | [Clean Code Full](https://github.com/ciembor/agent-rules-books/blob/main/clean-code/clean-code.md) |
| **Complex Domain Logic**<br>_Domain-Driven Design_ | Create Ubiquitous Language, boundary contexts, guard aggregates. | [DDD Full](https://github.com/ciembor/agent-rules-books/blob/main/domain-driven-design/domain-driven-design.md) |
| **Micro-Refactoring Safety**<br>_Refactoring_ | Prevent "feature creep during cleanup", mandate step-by-step green-to-green refactoring. | [Refactoring Full](https://github.com/ciembor/agent-rules-books/blob/main/refactoring/refactoring.md) |
| **Distributed / Scalable Data**<br>_Designing Data-Intensive Apps_ | Mitigate data corruption, design for eventual consistency, validate transactions. | [DDIA Full](https://github.com/ciembor/agent-rules-books/blob/main/designing-data-intensive-applications/designing-data-intensive-applications.md) |
| **Uncharted Legacy Territory**<br>_Working Effectively with Legacy Code_ | Establish integration characterization tests, locate seams, sprout/wrap safely. | [Legacy Code Full](https://github.com/ciembor/agent-rules-books/blob/main/working-effectively-with-legacy-code/working-effectively-with-legacy-code.md) |
