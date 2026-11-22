# Fixture C: Seeded Contradictions, Redundancy, and Non-Minimal Constituents (`UQL005`–`UQL007`)

1. Every Unit Test executes in memory without Calls Over The Network.
2. When a Unit Test verifies an External Dependency, the Unit Test executes Calls Over The Network.
3. No Unit Test performs Calls Over The Network during execution.
4. Every Domain Object in any software repository is Immutable after construction.
5. During a Maintenance Window, a Retry Policy retries a Failed Request.
6. A Retry Policy never retries a Failed Request.

## Glossary `D`

- **Unit Test** (`noun`, forms: `Unit Test`, `Unit Tests`): Automated test that verifies a single unit in memory without Calls Over The Network.
- **Calls Over The Network** (`noun`, forms: `Calls Over The Network`, `Call Over The Network`): Input or output communication across a network socket.
- **External Dependency** (`noun`, forms: `External Dependency`, `External Dependencies`): Third-party library or remote service outside the unit under test.
- **Domain Object** (`noun`, forms: `Domain Object`, `Domain Objects`): Internal model instance whose invariants hold by construction.
- **Immutable** (`adjective`, forms: `Immutable`): Unchanging in state after construction.
- **Maintenance Window** (`noun`, forms: `Maintenance Window`, `Maintenance Windows`): Scheduled period during which a service undergoes maintenance.
- **Retry Policy** (`noun`, forms: `Retry Policy`, `Retry Policies`): Strategy governing repeated execution of a Failed Request.
- **Failed Request** (`noun`, forms: `Failed Request`, `Failed Requests`): Operation that terminated with an error response.
- **execute** (`verb`, forms: `execute`, `executes`): Runs an operation or test.
- **verify** (`verb`, forms: `verify`, `verifies`): Asserts the behavior of a target.
- **perform** (`verb`, forms: `perform`, `performs`): Carries out an action.
- **retry** (`verb`, forms: `retry`, `retries`): Executes a Failed Request again.
