import { t as definePluginEntry } from "../../plugin-entry-CM_XK0Yw.js";
import { r as resolvePluginConfigObject } from "../../plugin-config-runtime-DqLEI0ep.js";
import { r as buildProviderToolCompatFamilyHooks } from "../../provider-tools-CLA-JkCS.js";
import { t as buildOpenAIImageGenerationProvider } from "../../image-generation-provider-BbSWfNDy.js";
import { t as openaiMediaUnderstandingProvider } from "../../media-understanding-provider-pGf0UNmE.js";
import { t as openAiMemoryEmbeddingProviderAdapter } from "../../memory-embedding-adapter-DeCuAlxt.js";
import { i as buildOpenAIProvider } from "../../openai-provider--d3ekh0L.js";
import { a as resolveOpenAISystemPromptContribution, i as resolveOpenAIPromptOverlayMode } from "../../prompt-overlay-Dhh04NIE.js";
import { t as buildOpenAIRealtimeTranscriptionProvider } from "../../realtime-transcription-provider-CptsGLLW.js";
import { t as buildOpenAIRealtimeVoiceProvider } from "../../realtime-voice-provider-CS4oALRb.js";
import { t as buildOpenAISpeechProvider } from "../../speech-provider-Cz48FKOM.js";
import { t as buildOpenAIVideoGenerationProvider } from "../../video-generation-provider-CIhtBF80.js";
//#region extensions/openai/index.ts
var openai_default = definePluginEntry({
	id: "openai",
	name: "OpenAI Provider",
	description: "Bundled OpenAI provider plugins",
	register(api) {
		const openAIToolCompatHooks = buildProviderToolCompatFamilyHooks("openai");
		const buildProviderWithPromptContribution = (provider) => ({
			...provider,
			...openAIToolCompatHooks,
			resolveSystemPromptContribution: (ctx) => {
				const pluginConfig = resolvePluginConfigObject(ctx.config, "openai") ?? (ctx.config ? void 0 : api.pluginConfig);
				return resolveOpenAISystemPromptContribution({
					config: ctx.config,
					legacyPluginConfig: pluginConfig,
					mode: resolveOpenAIPromptOverlayMode(pluginConfig),
					modelProviderId: provider.id,
					modelId: ctx.modelId,
					trigger: ctx.trigger
				});
			}
		});
		api.registerProvider(buildProviderWithPromptContribution(buildOpenAIProvider()));
		api.registerMemoryEmbeddingProvider(openAiMemoryEmbeddingProviderAdapter);
		api.registerImageGenerationProvider(buildOpenAIImageGenerationProvider());
		api.registerRealtimeTranscriptionProvider(buildOpenAIRealtimeTranscriptionProvider());
		api.registerRealtimeVoiceProvider(buildOpenAIRealtimeVoiceProvider());
		api.registerSpeechProvider(buildOpenAISpeechProvider());
		api.registerMediaUnderstandingProvider(openaiMediaUnderstandingProvider);
		api.registerVideoGenerationProvider(buildOpenAIVideoGenerationProvider());
	}
});
//#endregion
export { openai_default as default };
