# Java core

Rule logic shared by the JVM server and the browser (TeaVM). It must give the same bits as the JS rules in `src/`.

- Which JS files count as rules, and where each lands in Java: `tools/parity/rule-files.json`.
- After changing a rule file: update the Java, run `npm run golden`, `./gradlew :core:test` and `npm run test:parity`, commit all of it in a pull request.
- When `main` gets a push that leaves generated files stale (blocks, items, recipes), the `sync-generated` job regenerates them, runs the full gate, and opens one pull request (`bot/sync-generated`). No model and no secrets.
- When that cannot fix it, because a rule changed and the Java needs a real port, the `report-drift` job opens (or updates) a `java-drift` issue instead.
