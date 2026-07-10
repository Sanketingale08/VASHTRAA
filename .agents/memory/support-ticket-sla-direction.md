---
name: Support ticket SLA escalation direction
description: Why SLA due-date resets must be tied to whose turn it is to respond, not just "any reply happened"
---

In a two-way ticket thread, an SLA/auto-escalation timer only makes sense while the party being held accountable (the seller) owes a response. A ticket status like "Waiting for Customer" means the ball is in the *other* party's court, and must be excluded from the "past SLA" check — otherwise waiting-on-customer tickets get wrongly auto-escalated as if the seller were unresponsive.

**Why:** A first implementation set/reset `slaDueAt` on every reply regardless of direction, and only excluded `Resolved`/`Closed` from the breach check. That let a ticket the seller had already answered (status = Waiting for Customer) keep counting against the seller's SLA.

**How to apply:** When building any "X owes a response" SLA/escalation timer: (1) only compute/check the deadline for statuses where the accountable party is expected to act; (2) clear or leave the deadline untouched when the ball moves to the other party; (3) only restart the deadline when the ball moves back. This applies symmetrically wherever the same reply endpoint serves more than one direction (e.g. a seller's ticket can flow customer→seller or seller→admin) — branch the status transition and notification recipient on which direction the ticket is actually in, not just on which role hit the endpoint.
