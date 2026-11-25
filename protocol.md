# FrameProtocol version 1

The message contract between a page that embeds supersonic-frame (the embedder) and the frame. It carries one OSC packet exactly as the embedder's C# encoded it, or one of the controls below — nothing else. A second app can implement an embedder from this document alone.

## Envelope

Every control message is a structured `postMessage` object. A request is `{kind, id, ...fields}` where `id` is a positive integer the embedder chooses, unique among its outstanding requests. A reply is `{kind, id, ok: true, ...fields}` or `{kind, id, ok: false, error}` with the same `id`. Pushes (ready, clock, feedback) carry no `id`. Binary payloads (OSC packets, SynthDef bytes) are `Uint8Array`s whose buffers are transferred, never copied.

## Versions

The frame announces its protocol in ready. Protocol version is a single integer, changed only when a wire meaning changes. An embedder built against version N boots only a frame that announces N; on any other value it does not boot and reports both versions (see Errors). Each protocol version is published under its own path (`/vN/`) and never edited after publication.

## Origins

Both sides send with an exact `targetOrigin` of the counterpart's origin and ignore every message whose `origin` is not that origin, whose `source` is not the frame (embedder side) or the embedding window (frame side), or that arrives before ready. There is no token; the frame holds nothing beyond making sound.

## Errors

A start can fail in exactly these ways, and the embedder reports each with its own text: `unreachable` (no ready arrived), `version-mismatch:<announced>` (ready named another version), `boot-failed:<reason>` (the engine inside the frame failed to start, including an unknown SynthDef name), and `audio-not-permitted` (no user gesture, or autoplay not delegated with `allow="autoplay"`). A control that fails after boot replies `ok: false` with the engine's reason.

## ready

Push, frame → embedder, once the page and its offline cache are complete: `{kind: "ready", protocol: 1}`. No reply. Nothing else is answered before ready.

## boot

Request, embedder → frame: `{kind: "boot", id, names: [string], epoch}` — the catalogue SynthDef names to load from the frame's own copies, and the session epoch feedback will be tagged with. Boots the engine (two output bus channels) from the embedder's user gesture. Reply: the info fields. Error: `boot-failed:<reason>`, naming any unknown SynthDef; no partial catalogue is reported ready.

## osc

Embedder → frame, no reply: a `Uint8Array` whose buffer is one OSC packet exactly as encoded. The frame forwards it to the engine unchanged.

## loadSynthDef

Request: `{kind: "loadSynthDef", id, name, bytes}` with `bytes` a transferred `Uint8Array`. Loads one SynthDef from bytes the embedder supplies (the embedder fetched them from its own origin; the frame never fetches the embedder's origin). Reply `ok`, or the engine's error.

## allocSample

Request: `{kind: "allocSample", id, bufferId, frames, channels}`. Allocates one sample buffer, completing only when the engine has it; the embedder sends fills afterwards as osc packets. Error: the engine's reason.

## clock

Push, frame → embedder, about every 100 ms: `{kind: "clock", seconds}` — the engine audio clock. The value belongs to the frame's own time origin and is never comparable raw; the embedder anchors it to its page clock on arrival and extrapolates (ADR 0014 in Grooveloom).

## info

Request: `{kind: "info", id}`. Reply: `{sampleRate, baseLatencyMs, outputLatencyMs, maxChannelCount}` from the engine's audio context.

## feedback

Push, frame → embedder, as produced: `{kind: "feedback", epoch, overflow, facts}` — raw decoded engine facts for the session epoch named in boot, bounded at 4096 records and 64 KiB per record; beyond that `overflow` is true and facts drop.

## purge

Request: `{kind: "purge", id}`. Drops every bundle sent but not yet played; replies only after the engine acknowledges.

## selectDevice

Request: `{kind: "selectDevice", id, deviceId}`. Routes the engine context to that output device (`allow="speaker-selection"` must be delegated). On refusal the previous device keeps playing and the reply is the refusal reason; on success the embedder re-reads info.

## cueProbe

Request: `{kind: "cueProbe", id}`. Reply: `{maxChannelCount, fourOutputDeliverable}` for the selected device, from a probe context. The probe routes nothing and boots no second engine.
