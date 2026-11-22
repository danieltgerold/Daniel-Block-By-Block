# Java core

Rule logic shared by the JVM server and the browser (TeaVM). It must give the same bits as the JS rules in `src/`.

- Which JS files count as rules, and where each lands in Java: `tools/parity/rule-files.json`.
- After changing a rule file: update the Java, run `npm run golden`, `./gradlew :core:test` and `npm run test:parity`, commit all of it in a pull request.
- A push to `main` that breaks parity opens (or updates) a `java-drift` issue automatically.
