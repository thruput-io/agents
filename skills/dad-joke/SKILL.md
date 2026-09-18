---
name: dad-joke
description: Delivers a software engineering dad joke immediately with no user input. Use whenever the user invokes /dad-joke, asks for a dad joke, programmer humor, coding puns, or a programming joke.
---

# Dad joke

Deliver a dad joke based on software engineering concepts.

## Purpose

Emit one clean dad joke based on software engineering concepts with zero prompt overhead.

## When to use

- The user runs `/dad-joke`.
- The user asks for a programmer joke, dad joke, or coding pun.
- The user wants a moment of levity during a long debugging session.

## When not to use

- Active production outages, incidents, or security reviews.
- Strict technical discussions where the user expects direct answers only.

## Setup

No external dependencies, API keys, or background services required.

## Commands

Invoke the skill directly:

```bash
/dad-joke
```

## Examples

Universal software engineering joke:

```markdown
Why do programmers prefer dark mode?

Because light attracts bugs.
```

Version control joke:

```markdown
Why did the Git commit break up with the repository?

It could not handle the commitment.
```

## Notes

- Zero input. Do not ask the user for preferences or clarification.
- No commentary. Output only the setup, an empty line, and the punchline.
- Implicit context. If the session focuses on a specific tool such as Git, Docker, or SQL, match the joke to that tool silently.
- Technical grounding. Base punchlines on real mechanisms such as cache invalidation, recursion, or pointers.
- Tone. Keep jokes clean and workplace safe. Avoid insults and profanity.
