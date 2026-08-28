import { $t as ProviderThinkingProfile, wt as ProviderDefaultThinkingPolicyContext } from "./plugin-entry-R9cUrV0y.js";

//#region extensions/vllm/thinking-policy.d.ts
type VllmQwenThinkingFormat = "chat-template" | "top-level";
declare function resolveVllmQwenThinkingFormatFromCompat(compat?: ProviderDefaultThinkingPolicyContext["compat"]): VllmQwenThinkingFormat | undefined;
declare function resolveThinkingProfile(ctx: ProviderDefaultThinkingPolicyContext): ProviderThinkingProfile | null;
//#endregion
export { resolveThinkingProfile as n, resolveVllmQwenThinkingFormatFromCompat as r, VllmQwenThinkingFormat as t };