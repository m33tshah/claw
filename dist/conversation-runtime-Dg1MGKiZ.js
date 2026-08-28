import { r as createLazyRuntimeModule } from "./lazy-runtime-BgpbKGBP.js";
import "./session-binding-service-DTTXuI4v.js";
import "./conversation-binding-ClAcKC7o.js";
import "./thread-bindings-policy-ZPTJOYzU.js";
import "./channel-access-compat-B0Py0zhi.js";
import "./binding-registry-0y4bNODq.js";
import "./session-B32E3ea4.js";
import "./pairing-store-D-135J6T.js";
import "./binding-targets-4jTjOeWX.js";
import "./binding-routing-CR51Xysx.js";
import "./pairing-challenge-D_qdFBP8.js";
import "./pairing-labels-BwfwTVGY.js";
//#region src/channels/session-meta.ts
const loadInboundSessionRuntime = createLazyRuntimeModule(() => import("./inbound.runtime.js"));
/**
* Best-effort inbound session metadata recorder for channel plugin command handlers.
*/
async function recordInboundSessionMetaSafe(params) {
	const runtime = await loadInboundSessionRuntime();
	const storePath = runtime.resolveStorePath(params.cfg.session?.store, { agentId: params.agentId });
	try {
		await runtime.recordInboundSessionMeta({
			storePath,
			sessionKey: params.sessionKey,
			ctx: params.ctx
		});
	} catch (err) {
		params.onError?.(err);
	}
}
//#endregion
export { recordInboundSessionMetaSafe as t };
