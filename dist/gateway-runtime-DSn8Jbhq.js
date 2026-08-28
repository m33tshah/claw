import "./net-BOKtNTf8.js";
import "./auth-B27MflKU.js";
import "./client-CE2rtDfj.js";
import "./src-CToKmqGn.js";
import "./operator-approvals-client-CzweFEZT.js";
import "./gateway-rpc-BoB9QfdI.js";
import "./hosted-plugin-surface-url-gF09az3Y.js";
import "./plugin-node-capability-CQtFV9Fn.js";
import "./node-command-policy-CO8bCAnE.js";
import "./nodes.helpers-DNOcv5eI.js";
import "./startup-auth-DZYTzdv5.js";
//#region src/gateway/channel-status-patches.ts
/** Creates a connected-channel status patch with matching connection/event timestamps. */
function createConnectedChannelStatusPatch(at = Date.now()) {
	return {
		connected: true,
		lastConnectedAt: at,
		lastEventAt: at
	};
}
/** Creates a transport-activity patch for health/activity monitors. */
function createTransportActivityStatusPatch(at = Date.now()) {
	return { lastTransportActivityAt: at };
}
//#endregion
//#region src/plugin-sdk/gateway-runtime.ts
async function resolveAdvertisedLanHost() {
	return await (await import("./advertised-lan-host-BA_M5DGH.js")).resolveAdvertisedLanHost();
}
//#endregion
export { createConnectedChannelStatusPatch as n, createTransportActivityStatusPatch as r, resolveAdvertisedLanHost as t };
