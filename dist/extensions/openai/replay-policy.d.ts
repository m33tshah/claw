import { Ht as ProviderReplayPolicyContext, Vt as ProviderReplayPolicy } from "../../plugin-entry-R9cUrV0y.js";

//#region extensions/openai/replay-policy.d.ts
/**
 * Returns the provider-owned replay policy for OpenAI-family transports.
 */
declare function buildOpenAIReplayPolicy(ctx: ProviderReplayPolicyContext): ProviderReplayPolicy;
//#endregion
export { buildOpenAIReplayPolicy };