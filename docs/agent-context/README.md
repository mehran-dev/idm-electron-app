# Learn agentic context engineering

Context engineering means choosing the facts, instructions, tools, and feedback an agent needs for the current task. A harness is the surrounding workflow that supplies those inputs and checks the result. This repository now has a starter context harness; it is not an autonomous job runner.

## Start here

1. Read the root [AGENTS.md](../../AGENTS.md). Its job is to give short working rules and point to useful documents.
2. Read [ARCHITECTURE.md](../../ARCHITECTURE.md) to understand where a change belongs.
3. Copy [TASK.md](templates/TASK.md) to a named task document for a substantial feature. Fill in the outcome and acceptance criteria first.
4. Ask the agent to implement that task and use [VERIFICATION.md](VERIFICATION.md).
5. Review the diff and evidence. If the agent repeatedly misses a real requirement, add one specific rule to the appropriate scoped guide.

Example request:

> Read AGENTS.md and docs/agent-context/my-task.md. Implement the acceptance criteria, run the relevant verification commands, and report any behavior you could not verify.

Create `my-task.md` from the template before using that prompt. Template placeholders describe fields to fill in; they are not active requirements.

## What each file does

| File                                           | Purpose                                      | How it reaches the agent                                                 |
| ---------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| Root `AGENTS.md`                               | Stable project rules and context map         | Codex instruction discovery                                              |
| `src/main/AGENTS.md`, `src/renderer/AGENTS.md` | Rules specific to an area                    | Directory-scoped instructions; root guide also explicitly routes readers |
| `ARCHITECTURE.md`                              | Process boundaries and dependency rules      | Read when the task needs architecture context                            |
| `VERIFICATION.md`                              | Commands and manual checks                   | Linked from the root guide                                               |
| `templates/TASK.md`                            | Outcome, scope, acceptance, progress         | Copy and reference in a task prompt                                      |
| `templates/HANDOFF.md`                         | Resume unfinished work with evidence         | Fill in and reference in the next session                                |
| `templates/DECISION.md`                        | Record a durable design choice and rationale | Copy when an architectural decision warrants a record                    |
| `templates/AGENTS.md.example`                  | Starting rules for another repository        | Adapt and rename to `AGENTS.md` in that repository                       |
| `templates/config.toml.example`                | Optional Codex runtime settings              | Inert until deliberately installed as `.codex/config.toml`               |

The filename is **AGENTS.md**, not `agens.ms`. Architecture and task document names are conventions you choose; they have no automatic Codex instruction behavior by themselves.

Codex discovers instruction files along its documented directory chain. More local guidance is combined after broader guidance; `AGENTS.override.md` takes precedence over `AGENTS.md` in the same directory. Start a new session after changing instructions and ask which sources were loaded. For work initiated at the root, explicitly read the area guide as instructed here. See [official instruction discovery documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

## Runtime configuration versus project knowledge

`AGENTS.md` describes how to work in this repository. A Codex TOML file configures runtime behavior such as sandboxing. Project configuration is loaded from `.codex/config.toml` for trusted projects and remains subject to higher-priority or managed settings. Our example is deliberately stored in the templates folder, so creating these docs does not change runtime permissions. Review its comments before copying it into a writable `.codex` directory. See [official configuration basics](https://learn.chatgpt.com/docs/config-file/config-basic) and [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

## How to keep context useful

Load information in stages: root rules, relevant area, relevant source, then targeted supporting documents. Avoid reading every document for every task. A short accurate map is easier to maintain than a large repeated description of the code.

Keep three kinds of information separate:

- **Stable constraints:** “Renderer code uses the preload bridge.” Put these in architecture or scoped instructions.
- **Task requirements:** “Column order survives reopening the app.” Put these in acceptance criteria.
- **Evidence:** “Build passed; drag-and-drop was not manually checked.” Put this in the task result or handoff.

Prefer a concrete rule such as “validate saved column IDs before using them” over “write robust code.” Do not add a rule for every one-off preference. Remove obsolete rules when the project changes. Treat a source file as evidence for implementation facts; do not preserve a stale document claim just because it is written down.

## A small learning exercise

Use the table layout feature as a practice task. Write criteria for reordering, sorting after reordering, width alignment, restarting, and invalid saved settings. Ask the agent to inspect the current implementation and identify which criteria have evidence. Then compare its report with your own app checks. This teaches how acceptance criteria and feedback reveal gaps in an otherwise plausible implementation.

## Optional next layers

Add a reusable skill only after a workflow repeats enough to justify packaging it. Add tool integrations only when a task needs their data or actions. Add automated evaluations when you have representative tasks and explicit pass/fail criteria. These layers are optional; this starter does not install skills, hooks, external services, or subagents.
