# Releasing

1. `npm test` and `npm run build` must pass.
2. Push to `main`. The Pages workflow publishes the build under `v<protocol>/` (currently `v1/`) and a root page listing published versions.
3. **A published version path is never edited after publication.** Fix forward by publishing nothing over it: if the wire meaning changes, bump the protocol integer in `frame.js` and `protocol.md` and publish under the new path; if only the engine changes within the same wire, the path still stays as first published — embedders that pin it keep the sound they were built against.
4. Verify the published address in a clean Chrome profile: embed it, boot a catalogue SynthDef, then go offline and reload the frame.
