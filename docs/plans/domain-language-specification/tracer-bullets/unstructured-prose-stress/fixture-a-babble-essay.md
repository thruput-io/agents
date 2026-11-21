# Fixture A: Unstructured Architecture Essay with Babble, Inline URLs, and Quotes

In modern software engineering, it goes without saying that domain boundaries are really very important for teams that want to build great systems over a long period of time. As Alistair Cockburn famously wrote in [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/), "Allow an application to equally be driven by users, programs, automated test or batch script, and to be developed and tested in isolation from its eventual run-time devices and databases." Basically, what this means in practice is that an application should always be able to run its tests without needing a real database or external network service.

When we talk about a Perimeter, a Perimeter is the boundary where an application meets the outside world. Every external payload arriving at the Perimeter must be parsed into a Domain Object by a Factory before any Domain Method executes. In other words, you should never pass unparsed Foreign Shapes into a Domain Method, because Foreign Shapes belong only at the Perimeter and must be translated into a Domain Object by a Factory first. Furthermore, as Alexis King explained in [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/), "Whenever possible, prefer functions that parse data into a more precise representation over functions that merely validate it and return unit or a boolean."

Additionally, every Domain Object is Immutable after creation. Because a Domain Object is Immutable after creation, a Domain Object never exposes a Setter that mutates its fields in place.

## Glossary

- **Perimeter** (`noun`, forms: `Perimeter`, `Perimeters`): Boundary where an application interacts with external systems.
- **Foreign Shape** (`noun`, forms: `Foreign Shape`, `Foreign Shapes`): Unvalidated data structure originating outside the Perimeter.
- **Domain Object** (`noun`, forms: `Domain Object`, `Domain Objects`): Internal model instance whose invariants hold by construction.
- **Factory** (`noun`, forms: `Factory`, `Factories`): Function or method that parses a Foreign Shape into a Domain Object.
- **Domain Method** (`noun`, forms: `Domain Method`, `Domain Methods`): Operation defined on a Domain Object.
- **Setter** (`noun`, forms: `Setter`, `Setters`): Method that mutates the state of an instance after construction.
- **Immutable** (`adjective`, forms: `Immutable`, `immutable`): Unchanging in state after construction.
