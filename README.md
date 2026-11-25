# supersonic-frame

SuperSonic (a WebAssembly port of SuperCollider's scsynth) hosted in its own frame: a static page that takes OSC bytes and a small set of control messages from the page that embeds it, and makes sound. Any app can embed it; Grooveloom is its first.

- Protocol: [protocol.md](protocol.md) (FrameProtocol version 1)
- Licence: AGPL-3.0-or-later, as SuperSonic's client and core are (see LICENSE)
- Serve locally: `npm run serve` (http://127.0.0.1:7441/)
- Tests: `npm test`

Status: skeleton. The page currently answers only the protocol's ready handshake; engine controls are added task by task under Grooveloom's engine-frame feature (#222).
