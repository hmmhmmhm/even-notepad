# Architecture

Quiet Terminal is a Vite web application hosted by Even App. The phone renders a typewriter surface; the G2 display is controlled through the Even Hub SDK. The two views deliberately show different text in writing mode.

## Entry and navigation

`src/main.ts` initializes the bridge, coordinates the active mode, and routes phone and glasses input. The startup menu offers Editor, Terminal, X, and News. Double-tap on the glasses returns to the menu from a feature or the computer picker. Double-tap on the startup menu opens the Even system exit confirmation. Input and rendering behavior must be checked on physical hardware as well as the simulator.

## Editor and documents

The phone's native input drives the writer and typewriter animation. `src/viewport.ts` wraps text into display lines and maintains scroll positions; `src/glasses-scroll.ts` handles successive scroll inputs. Editor HUD code displays the cursor, file name, and counts. Documents and folders are managed by the document library and storage modules. The Even App SDK supplies host storage, while standalone use falls back to browser storage.

## Even Terminal

The terminal client connects to an existing Even Terminal server using its HTTP API. It loads sessions and history, sends prompts, watches for updates, and handles busy or locked sessions. The phone supplies text and the glasses display session selection and output. The application does not implement the server. The package network allowlist limits reachable origins. A private build can merge locally configured Terminal origins into both the bundle and manifest. See [Connections](connections.md).

## X and news

The X client sends user credentials to the configured relay, including the refresh token during renewal. The relay deployment and its logging and retention settings are not verified in this repository. The X memory helper bounds retained posts. News resolves the phone locale, loads localized RSS data through the configured API, and uses a controller to discard stale asynchronous results. News display code adapts the imported SANDEVISTAN HUD; its upstream license is retained in `src/news/SANDEVISTAN-LICENSE.txt`.

## Storage and credentials

Connection settings, including tokens, are stored locally through the Even App SDK or browser storage. The SDK does not document this as encrypted credential storage. Never commit tokens, personal documents, server credentials, or device-specific logs. HTTP connections do not provide transport encryption; prefer a private HTTPS connection where available.
