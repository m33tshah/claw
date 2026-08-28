import { t as getProviderEnvVars } from "../../provider-env-vars-BDpb07cq.js";
import { n as listMemoryEmbeddingProviders } from "../../memory-embedding-provider-runtime-DoPdwtEJ.js";
import { n as resolveMemoryFtsState, r as resolveMemoryVectorState, t as resolveMemoryCacheSummary } from "../../status-format-ExS6-yQO.js";
import "../../memory-core-host-status-BkahMnJL.js";
import { t as DEFAULT_LOCAL_MODEL } from "../../embedding-defaults-BP3wPc9o.js";
import "../../memory-core-host-embedding-registry-tP0B5yVM.js";
import { t as hasConfiguredMemorySecretInput } from "../../secret-input-B4ViYdFq.js";
import { t as checkQmdBinaryAvailability } from "../../engine-qmd-zad3_Bbe.js";
import "../../memory-core-host-engine-qmd-CYYykT7J.js";
import "../../provider-env-vars-Ci1-Nl4l.js";
import { u as configureMemoryCoreDreamingState } from "../../dreaming-state-DLMGVRgZ.js";
import { S as repairShortTermPromotionArtifacts, d as loadShortTermPromotionDreamingStats, s as auditShortTermPromotionArtifacts, x as removeGroundedShortTermCandidates } from "../../short-term-promotion-stx0l04M.js";
import { a as createEmbeddingProvider, t as MemoryIndexManager } from "../../manager-DB4_iNu4.js";
import { r as getMemorySearchManager } from "../../memory-uRuN-UIa.js";
import { t as memoryRuntime } from "../../runtime-provider-DCyBb8Rm.js";
import { n as repairDreamingArtifacts, t as auditDreamingArtifacts } from "../../dreaming-repair-Cduzr-hL.js";
//#region extensions/memory-core/src/memory/provider-adapters.ts
function getBuiltinMemoryEmbeddingProviderAdapter(id) {
	return listMemoryEmbeddingProviders().find((adapter) => adapter.id === id);
}
function getBuiltinMemoryEmbeddingProviderDoctorMetadata(providerId) {
	const adapter = getBuiltinMemoryEmbeddingProviderAdapter(providerId);
	if (!adapter) return null;
	const authProviderId = adapter.authProviderId ?? adapter.id;
	return {
		providerId: adapter.id,
		authProviderId,
		envVars: getProviderEnvVars(authProviderId),
		transport: adapter.transport === "local" ? "local" : "remote",
		autoSelectPriority: adapter.autoSelectPriority
	};
}
function listBuiltinAutoSelectMemoryEmbeddingProviderDoctorMetadata() {
	return listMemoryEmbeddingProviders().filter((adapter) => typeof adapter.autoSelectPriority === "number").toSorted((a, b) => (a.autoSelectPriority ?? 0) - (b.autoSelectPriority ?? 0)).map((adapter) => {
		const authProviderId = adapter.authProviderId ?? adapter.id;
		return {
			providerId: adapter.id,
			authProviderId,
			envVars: getProviderEnvVars(authProviderId),
			transport: adapter.transport === "local" ? "local" : "remote",
			autoSelectPriority: adapter.autoSelectPriority
		};
	});
}
//#endregion
export { DEFAULT_LOCAL_MODEL, MemoryIndexManager, auditDreamingArtifacts, auditShortTermPromotionArtifacts, checkQmdBinaryAvailability, configureMemoryCoreDreamingState, createEmbeddingProvider, getBuiltinMemoryEmbeddingProviderDoctorMetadata, getMemorySearchManager, hasConfiguredMemorySecretInput, listBuiltinAutoSelectMemoryEmbeddingProviderDoctorMetadata, loadShortTermPromotionDreamingStats, memoryRuntime, removeGroundedShortTermCandidates, repairDreamingArtifacts, repairShortTermPromotionArtifacts, resolveMemoryCacheSummary, resolveMemoryFtsState, resolveMemoryVectorState };
