# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the "Label in our tracker" column to match whatever vocabulary you actually use.

## Wayfinder labels

`/wayfinder` uses a second, non-triage vocabulary. These labels mark a map and the kind of ticket hanging off it:

| Label                | Applied to                                                         |
| -------------------- | ------------------------------------------------------------------ |
| `wayfinder:map`      | The single map issue that holds Notes / Decisions-so-far / Fog      |
| `wayfinder:research` | A child ticket answered by reading docs, code, or the outside world |
| `wayfinder:prototype`| A child ticket answered by building a throwaway prototype           |
| `wayfinder:grilling` | A child ticket answered by interrogating the user                   |
| `wayfinder:task`     | A child ticket that is just work to be done                         |

Only the triage five and the five `wayfinder:*` labels are part of the pinned vocabulary. Don't add further labels on your own initiative; apply only the ones the skill in hand asks for.
