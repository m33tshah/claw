import "./media-runtime-Bhpuwb4C.js";
import "./text-chunking-D2ymAM_S.js";
import { t as createPluginRuntimeStore } from "./runtime-store-uAKGMqTs.js";
import "./channel-outbound-DkdAAOhG.js";
import "./outbound-media-DYSQY8nu.js";
import "./ssrf-runtime-DBG77fRY.js";
import "./dangerous-name-runtime-cJriWyuh.js";
import "./channel-status-D0V3ybJh.js";
import "./bundled-channel-config-schema-CkfMA6sO.js";
import "./channel-config-primitives-C06GtQX7.js";
import "./channel-actions-DLW94VY-.js";
import "./channel-inbound-CxUVIreR.js";
import "./channel-feedback-ChYFAgPX.js";
import "./channel-pairing-3Uf4WD4J.js";
import "./webhook-request-guards-6tg5xzrX.js";
import "./webhook-ingress-D6RzsqkF.js";
import "./webhook-targets-Cf7M1LLA.js";
//#region extensions/googlechat/src/runtime.ts
const { setRuntime: setGoogleChatRuntime, getRuntime: getGoogleChatRuntime } = createPluginRuntimeStore({
	pluginId: "googlechat",
	errorMessage: "Google Chat runtime not initialized"
});
//#endregion
export { setGoogleChatRuntime as n, getGoogleChatRuntime as t };
