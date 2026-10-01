# Lab engine

Each learning unit leads to a practical lab designed to collect evidence, not merely mark attendance.

## Workspace

A lab includes a scenario, goal, evaluation criteria, and files. Provided files are read-only. `YOU_BUILD` files contain editable starter content and are the learner's working area. Drafts autosave against the owned lab attempt, and the UI reports saving, saved, and error states.

Run checks evaluate the current draft and return persisted results. The current implementation does not claim an unrestricted remote code execution environment; checks follow the lab's backend-owned evaluation contract.

## Help boundaries

Each lab allows exactly **two normal hints**. Hints are scoped to the selected editable file and their usage is stored by the backend. **System Assistance** is separate from those two hints. It can unblock the learner where supported, but the resulting work is recorded as assisted rather than independent.

## Submission and evidence

Submission records the attempt and generates evidence across three practical outcomes:

- completed independently;
- completed with assistance; or
- not demonstrated.

That evidence feeds progress and continuation analysis. Cancellation or failure in a later purchase flow never rewrites lab evidence.

After completion, a lab reopens in read-only review mode with its saved files, results, hints, and evidence. The result screen uses the backend next action to move to the next unit, continuation summary, or Home; reopening the lab does not create another attempt or regenerate the unit.
