import { o as ProviderUsageSnapshot } from "../../provider-usage.types-wjE6UjsI.js";
import { Jt as ProviderResolveUsageAuthContext, Ot as ProviderFetchUsageSnapshotContext, Xt as ProviderResolvedUsageAuth } from "../../plugin-entry-R9cUrV0y.js";

//#region extensions/anthropic/usage.d.ts
declare function fetchAnthropicAdminUsage(params: {
  apiKey: string;
  timeoutMs: number;
  fetchFn: typeof fetch;
  now?: number;
  periodDays?: number;
}): Promise<ProviderUsageSnapshot>;
declare function resolveAnthropicUsageAuth(ctx: ProviderResolveUsageAuthContext): Promise<ProviderResolvedUsageAuth>;
declare function fetchAnthropicUsage(ctx: ProviderFetchUsageSnapshotContext): Promise<ProviderUsageSnapshot>;
//#endregion
export { fetchAnthropicAdminUsage, fetchAnthropicUsage, resolveAnthropicUsageAuth };