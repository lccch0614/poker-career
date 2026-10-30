# Tournament simulation — 2026-10-30

Command: `node scripts/simulate-tournaments.cjs 50`

50 simulated 200-player tournaments, 10,000 player entries, 49,768 table hands and 371,725 player-hands. AI-only, shuffled seat assignments with deterministic seeds, hard difficulty, turbo blind structure. Each table plays one hand per synchronous round; blind levels increase every eight rounds. This is a controlled stress test and does not model the production wall-clock schedule, a human player or independent background-table timing.

- Every tournament finished, and chips were conserved after every round.
- Mean rounds: paid places 65.8, final eight 98.5, champion 142.4; finish range 116–176 rounds.
- Player-hand VPIP 25.6%, PFR 17.2%, 3-bet per recorded opportunity 9.7%.
- Of 392,718 preflop actions: folds 71.8%, raises 17.4%, all-ins 3.0%. These are action-based, not per-hand rates, and categories can overlap.

No previous-version baseline or external target was included. These figures characterize this simulation, not proof of realistic or optimal strategy. Ranges are heuristic and probability estimates are sampled. The range-aware all-in call currently applies to heads-up, fully coverable preflop shoves without conflicting side pots; other situations use the general tournament policy.
