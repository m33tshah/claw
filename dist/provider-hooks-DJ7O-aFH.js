import { s as createGoogleThinkingStreamWrapper } from "./provider-stream-shared-B4Hm1tKd.js";
import { a as buildProviderReplayFamilyHooks } from "./provider-model-shared-BK8T_tBM.js";
import { r as buildProviderToolCompatFamilyHooks } from "./provider-tools-CLA-JkCS.js";
import "./thinking-api-DGtrLCAV.js";
import { i as resolveGoogleThinkingProfile } from "./provider-policy-Cqf16FXy.js";
//#region extensions/google/provider-hooks.ts
const GOOGLE_GEMINI_PROVIDER_HOOKS = {
	...buildProviderReplayFamilyHooks({ family: "google-gemini" }),
	...buildProviderToolCompatFamilyHooks("gemini"),
	resolveThinkingProfile: (context) => resolveGoogleThinkingProfile(context),
	wrapStreamFn: createGoogleThinkingStreamWrapper
};
//#endregion
export { GOOGLE_GEMINI_PROVIDER_HOOKS as t };
