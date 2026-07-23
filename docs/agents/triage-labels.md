# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual
strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding string
from this table.

## How a label is applied

This repo has no label system — `ISSUES.md` is a markdown table, not GitHub Issues. "Applying a label"
means writing the role as a **bold prefix in the `Status` column**, ahead of the existing prose:

```
| ISSUE-31 | Receipt reprint duplicates the footer | Story 22 | Minor | **ready-for-agent** — deterministic repro, fix scoped to one file |
```

Rules:

- Exactly one role per issue at a time. Replacing a role means overwriting the prefix, not appending.
- The prose after the `—` is not optional; it's why the role was chosen.
- `wontfix` does **not** mean delete the row. `ISSUES.md` keeps closed issues as a record of what has
  already bitten this project once — move the row to `## Resolved`, don't remove it.
- Several existing rows use plain-prose statuses (`Open — ...`, `Won't fix now — ...`) that predate
  this vocabulary. Leave them alone unless you're actively re-triaging that issue.

Edit the right-hand column above if the vocabulary ever changes.
