# AGENTS (native)

- Native App: Capacitor bündelt die SPA-Shell aus `bun run build:native` (MT_NATIVE=1, dist-native), kein server.url; Server-Funktionen gehen über src/lib/native/remote-fetch.ts an die öffentliche Origin mit CORS nur für App-Origins (src/lib/native/cors.ts), native Push-Tokens getrennt in native_push_tokens; Server-Funktions-IDs bleiben Compiler-Default, native API-Origin ist kanonisch https://mytransporter.org (www leitet um), CORS auch auf Fehlerantworten; Android-Release nur über .github/workflows/android.yml mit Env-Signierung und Play-Upload, iOS-CI deaktiviert.
