import { s as AgentMessage } from "../../types-D0CdrmU4.js";
import { In as ProviderSanitizeReplayHistoryContext, Sn as ProviderReplayPolicyContext, Vf as ProviderThinkingProfile, bn as ProviderReasoningOutputModeContext, xn as ProviderReplayPolicy, yn as ProviderReasoningOutputMode } from "../../types-DaHgOqFX.js";
import { Nt as ProviderNormalizeToolSchemasContext, a as AnyAgentTool, en as ProviderToolSchemaDiagnostic, wt as ProviderDefaultThinkingPolicyContext } from "../../plugin-entry-R9cUrV0y.js";
import { p as createGoogleThinkingStreamWrapper } from "../../provider-stream-shared-BDh1oeZM.js";
//#region extensions/google/provider-hooks.d.ts
declare const GOOGLE_GEMINI_PROVIDER_HOOKS: {
  resolveThinkingProfile: (context: ProviderDefaultThinkingPolicyContext) => ProviderThinkingProfile | undefined;
  wrapStreamFn: typeof createGoogleThinkingStreamWrapper;
  normalizeToolSchemas: (ctx: ProviderNormalizeToolSchemasContext) => AnyAgentTool[];
  inspectToolSchemas: (ctx: ProviderNormalizeToolSchemasContext) => ProviderToolSchemaDiagnostic[];
  buildReplayPolicy?: ((ctx: ProviderReplayPolicyContext) => ProviderReplayPolicy | null | undefined) | undefined;
  sanitizeReplayHistory?: ((ctx: ProviderSanitizeReplayHistoryContext) => Promise<AgentMessage[] | null | undefined> | AgentMessage[] | null | undefined) | undefined;
  resolveReasoningOutputMode?: ((ctx: ProviderReasoningOutputModeContext) => ProviderReasoningOutputMode | null | undefined) | undefined;
};
//#endregion
export { GOOGLE_GEMINI_PROVIDER_HOOKS };