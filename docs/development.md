# Development and verification

## Commands

```sh
npm ci
npm run typecheck
node --test tests/*.test.js
npm run build
npm run pack
```

Run `npm run dev` and then `npm run sim` for the Even Hub simulator. Development fixtures are available through `?fixture=1`, `?fixture=computers`, and `?fixture=x`; they are not production data.

## TypeScript

All application source files under `src/` are TypeScript and are included in the strict `typecheck` command. Tests use JavaScript and require a Node.js runtime that can execute erasable TypeScript; Node.js 25 was used for the recorded checks. SDK payload tests compare the generated page, image, and text update JSON with the original plain-object format. Validate SDK, DOM, and network behavior in the simulator and on real devices as well.

## Device checks

Validate phone focus, IME composition and deletion, text cursor placement, scrolling in both directions, tap and double-tap navigation, terminal session selection, and return to the startup menu on actual devices. Test connection setup, saved credentials, network failure, and reconnection without sharing secrets. A simulator or unit test cannot establish physical glasses or ring behavior.

## Packaging

`app.json` owns the package metadata and network allowlist. Verify the exact origins for Terminal, the X relay, and news before building. A saved computer is not necessarily reachable by the packaged app. Use the ignored `app.private.json` and `npm run pack:private` for local Terminal origins, as described in [Connections](connections.md#private-terminal-build). Do not add credentials to the allowlist or to Git.
