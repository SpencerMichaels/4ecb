# Product-owner task clarifications

This file records decisions for the active `tasks.txt` queue so later task
agents can begin from durable repository context rather than conversation
history. The corresponding implementation task should move any lasting product
or architecture decision into the established specification or decision log.

## Attack-type icon task

- The range/shape vocabulary must distinguish at least Melee, Ranged, Melee or
  Ranged, Close Burst, Close Blast, Area Burst, Area Wall, Aura, and Personal.
- Prefer a single-sword icon for Melee over crossed swords, if a suitable icon
  is available.
- The current arrow is acceptable for Ranged, but evaluate a bow icon as a
  potentially clearer alternative.
- Area Wall needs an immediately recognizable wall treatment, such as a castle
  wall or battlement, rather than an abstract hatched square.
- Close Burst means a radius centered on the attacker.
- The chosen Close Burst direction is a sun/radiance icon: one central point
  with rays clearly indicating outward emission.
- Close Blast means a cone originating from the attacker.
- Area Burst means a radius centered on a remote point chosen by the attacker.
- Area Wall means a line originating from a remote point chosen by the attacker.
- Before implementation, present a revised complete set of specific icons for
  every action type and attack/range shape, incorporating all feedback above
  and showing them at their intended UI size. Do not begin implementation until
  the product owner explicitly approves the full set.

## Arbitrary current-level task

Selecting level N should immediately set the character to level N. Every
unresolved choice from levels 1 through N remains visibly pending and editable
afterward; incomplete earlier choices must not block the level change.

## Class-detail revamp task

Produce a proposal for product-owner approval before implementation. The initial
candidate hierarchy is identity/summary, combat essentials, proficiencies and
skills, features and build choices, descriptive text, then subdued source
metadata; this hierarchy is not yet approved.

## Queue commit policy

Once a task is confirmed complete, commit its work. Keep different tasks in
separate commits.
