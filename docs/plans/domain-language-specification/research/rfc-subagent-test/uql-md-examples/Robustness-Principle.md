# Robustness Principle

Parent: Easy to Change

A producer emits the exact shape it defines; a consumer takes what it needs from what it receives and is not disturbed by what it does not know, following Postel's law and Tolerant Reader.

## Solutions

- A producer ships the expanded contract, migrates its consumers, then removes what is left over, so every step deploys on its own.
- Consumers publish the parts of the contract they rely on, so the producer sees what a change would break before it ships.

## References

[RFC 1122]: https://datatracker.ietf.org/doc/html/rfc1122#page-12 "Requirements for Internet Hosts: Be conservative in what you send and liberal in what you accept."
[Tolerant Reader]: https://martinfowler.com/bliki/TolerantReader.html "Martin Fowler: A consumer takes what it needs from what it receives and is not disturbed by what it does not know."
[Parallel Change]: https://martinfowler.com/bliki/ParallelChange.html "Danilo Sato: Expand, migrate, and contract so every step deploys independently."
[Consumer-Driven Contracts]: https://martinfowler.com/articles/consumerDrivenContracts.html "Ian Robinson: Let consumers publish their expectations so producers verify compatibility before shipping."
