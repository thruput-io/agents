# Fixture B: Seeded Lexical, Anaphoric, and Attachment Ambiguities (`UQL001`–`UQL004`)

1. Every Adapter translates a Contract at the Perimeter.
2. When a Producer sends a Message to a Consumer, it validates the Signature before delivery.
3. The Factory parses the Payload from the Client with a Schema.
4. Every Widget serializes its state through a Codec.

## Scope & Glossaries

### Context 1: `BoundedContextA` (`https://example.org/context-a/glossary.json`)
- **Contract** (`noun`, forms: `Contract`, `Contracts`): Schema specification governing message structure.

### Context 2: `BoundedContextB` (`https://example.org/context-b/glossary.json`)
- **Contract** (`noun`, forms: `Contract`, `Contracts`): Legal service-level agreement between organizations.

### Local Glossary `D` (`No ordered References disambiguating Contract`)
- **Adapter** (`noun`, forms: `Adapter`, `Adapters`): Component at the Perimeter that translates external payloads.
- **Perimeter** (`noun`, forms: `Perimeter`, `Perimeters`): Boundary between internal domain code and external systems.
- **Producer** (`noun`, forms: `Producer`, `Producers`): Service that emits a Message.
- **Consumer** (`noun`, forms: `Consumer`, `Consumers`): Service that receives a Message.
- **Message** (`noun`, forms: `Message`, `Messages`): Payload transmitted between a Producer and a Consumer.
- **Signature** (`noun`, forms: `Signature`, `Signatures`): Cryptographic digest authenticating a Message.
- **Factory** (`noun`, forms: `Factory`, `Factories`): Constructor function that creates a validated instance.
- **Payload** (`noun`, forms: `Payload`, `Payloads`): Data body carried by a request.
- **Client** (`noun`, forms: `Client`, `Clients`): External caller sending a Payload.
- **Schema** (`noun`, forms: `Schema`, `Schemas`): Structural specification validating a Payload.
- **Codec** (`noun`, forms: `Codec`, `Codecs`): Encoder and decoder pair at the Perimeter.
- **translate** (`verb`, forms: `translate`, `translates`): Converts a representation from one context to another.
- **send** (`verb`, forms: `send`, `sends`): Transmits a Message to a recipient.
- **validate** (`verb`, forms: `validate`, `validates`): Verifies conformance against a specification.
- **parse** (`verb`, forms: `parse`, `parses`): Constructs a typed value from raw input.
- **serialize** (`verb`, forms: `serialize`, `serializes`): Encodes a typed value into a wire representation.
