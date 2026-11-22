# Connections

## Even Terminal and Tailscale

Terminal connections are not supported in the public build. First create a [personal build](#private-terminal-build) that permits your server address, then follow these steps.

1. Install [Tailscale](https://tailscale.com/download) on your computer and phone. Sign in to the same tailnet on both devices.
2. Install Node.js and the [official Even Terminal server](https://www.npmjs.com/package/@evenrealities/even-terminal). On the computer, run:

   ```sh
   npm install -g @evenrealities/even-terminal
   even-terminal --provider codex --tailscale --allow-cors
   ```

   Complete first-run setup and keep the server running. Use the connection token shown by the server. Codex must be installed and signed in on the computer.
3. For a private HTTPS address, enable MagicDNS and HTTPS certificates in the [Tailscale DNS settings](https://login.tailscale.com/admin/dns). Then run:

   ```sh
   tailscale serve --bg http://127.0.0.1:3456
   ```

   Use the HTTPS address printed by Tailscale. The default server port is 3456; use your configured port if different. See [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve).
4. On the phone, open the paper clip → **Connect Even Terminal** → **Add computer**. Enter a name, the server address, and the connection token. Select **Terminal** on the glasses.

Personal builds permit only addresses listed in their packaged manifest; wildcard support is not verified. `--allow-cors` permits cross-origin requests, so keep the server on a trusted tailnet and protect its token. The Even App storage used for tokens is not documented as encrypted credential storage.

## X (Twitter)

1. Create an app in the [X Developer Console](https://console.x.com/). Configure OAuth 2.0 as a **Native App** or **Single Page App** (public client).
2. Obtain a user access token with `tweet.read` and `users.read` permissions. For automatic renewal, request `offline.access` and obtain the Client ID and refresh token. Follow the [X OAuth guide](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code) and check [timeline access requirements](https://docs.x.com/x-api/posts/timelines/introduction).
3. On the phone, open the paper clip → **Connect X (Twitter)**. Enter the user access token. For renewal, also enter the Client ID and refresh token, then save. Select **X (Twitter)** on the glasses.

Use an OAuth 2.0 **user** token, not the app-only Bearer Token. X API access and usage charges depend on your X account and plan. If authorization expires or is revoked, obtain new credentials and enter them again. Tokens are saved in Even App storage; its encryption is not documented.


## Private terminal build

The public manifest contains no personal computer addresses. To make a private build for your own server, create a local `app.private.json` in the project root:

```json
{ "terminalOrigins": ["https://computer.example"] }
```

Replace the example with your server's exact origin, including its port when needed. Do not put tokens in this file. The file is ignored by Git. Run `npm run pack:private` to build an isolated copy with terminal enabled and the additional origins in both the app bundle and manifest. The output is `quiet-terminal.private.ehpk`, which is also ignored by Git. The public `npm run pack` creates `quiet-terminal.ehpk`, does not read the private configuration, and does not support terminal connections.

## Relay and privacy

X requests use the relay configured in `src/x-client.ts`. The app sends the user access token to that relay and sends the client ID and refresh token there when renewing authorization. The news service uses a separate Worker and does not send X credentials. The deployed Workers are not included in this repository; their logging, retention, availability, and abuse controls are not verified here. Use only a relay you trust, and review the deployment before using real credentials.
