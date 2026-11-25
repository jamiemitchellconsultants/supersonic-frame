// supersonic-frame: SuperSonic behind the FrameProtocol. This skeleton answers only
// ready; the engine controls arrive in later tasks of Grooveloom's engine-frame plan.

export const PROTOCOL_VERSION = 1;

const embedded = window.parent !== window;
const embedderOrigin = document.referrer ? new URL(document.referrer).origin : null;

if (embedded && embedderOrigin) {
  window.parent.postMessage({ kind: "ready", protocol: PROTOCOL_VERSION }, embedderOrigin);
}
