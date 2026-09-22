# Local dev tools

Local-only development infrastructure -- binaries/config you run **on your
own machine** to support developing against this backend (and, for LiveKit,
the website/mobile clients that also connect to it). Lives here rather than
its own repo since the webhook target and primary users are this backend;
nothing elsewhere in this repo references paths under here, and none of it
ships as part of the deployed app (see `tools/livekit/.gitignore` for what's
excluded from the binary/build).

## livekit/

A local [LiveKit](https://livekit.io) server (`livekit-server --dev`
equivalent, but with webhooks enabled) used to test the in-app video call
features (Parent-Teacher Meetings, Online Class) against a real WebRTC
target without needing a cloud LiveKit project.

- `livekit.yaml` — tracked. Fixed dev credentials (`devkey`/`secret`) and a
  webhook pointed at the backend's local dev port. Matches
  `school-eos-backend/.env`'s `LIVEKIT_URL=ws://localhost:7880` /
  `LIVEKIT_API_KEY=devkey` / `LIVEKIT_API_SECRET=secret`.
- `livekit-server.exe` — **not tracked** (gitignored, ~54MB). Fetch it with:
  ```
  cd livekit
  powershell -ExecutionPolicy Bypass -File .\setup.ps1
  ```
- Run it:
  ```
  cd livekit
  .\livekit-server.exe --config livekit.yaml
  ```
  Listens on `ws://localhost:7880` (RTC on 7881/7882). A Windows-specific
  `hwstats`/"capacity management is unavailable" line in the startup log is
  harmless and expected.

## Adding another tool later

Give it its own subfolder here, same pattern: tracked config + a `setup.*`
script that fetches any binary, with the binary itself gitignored.
