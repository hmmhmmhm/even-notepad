# Quiet Terminal agent instructions

Read [ALIGNS.md](ALIGNS.md), [Architecture](docs/architecture.md), and [Development](docs/development.md) before relevant work. Respond in the user's preferred language.

- Preserve the separate phone typewriter and glasses display behavior. Validate changes to input, composition, scrolling, and navigation on real devices when available; distinguish simulator and hardware evidence.
- Keep user documents, access tokens, pairing keys, and private server information out of Git and logs. Do not claim that Even App storage is encrypted without evidence.
- Check `app.json` network permissions and packaged origins before a build is submitted. A saved address does not imply that the package permits it.
- Keep application source under `src/` in TypeScript and included in strict `typecheck`. Verify SDK payload compatibility and validate untrusted network and storage data at their boundaries.
- Run relevant tests, type checks, and a production build. Preserve existing user work and report any verification gaps.
- For external GitHub prose, follow the user's requirement to present the final draft for approval before posting. Do not treat an earlier draft approval as permission to change its contents.
- Use Astra only with explicit approval for the current task. Keep work on the requested branch.
