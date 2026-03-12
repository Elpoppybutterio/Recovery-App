# ADR-0007: Structured Chat Participant Identity

## Status

Accepted

## Context

The first structured internal chat slice needs strict manager-to-resident thread authorization now, but the current sober-house foundation stores a linked mobile user id for the resident profile and only staff-assignment records for sober-house managers. There is not yet a shared staff-auth user mapping in the local sober-house store.

## Decision

For the Task 5 chat foundation:

- Resident chat participants use the real `ResidentHousingProfile.linkedUserId`.
- Manager chat participants use a stable derived participant id of `staff-assignment:{staffAssignmentId}`.
- Authorization for thread creation is limited to active owner, house manager, or assistant manager assignments already authorized for the resident's house.
- Thread access is limited to explicit active participants stored on the thread.

## Consequences

- The chat data model stays reusable across future modules because participant identity is explicit on `ChatParticipant`.
- The current sober-house implementation can enforce participant-level access without waiting on a broader staff-auth migration.
- A future shared auth model can replace derived manager participant ids with real user ids without redesigning `ChatThread`, `ChatParticipant`, `ChatMessage`, or `ChatMessageReceipt`.
