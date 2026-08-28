import { i as OpenClawConfig } from "../types.openclaw-CXjMEWAQ.js";
import { s as AuthProfileStore } from "../types-CHOrRGmy.js";
import { v as MusicGenerationProviderPlugin } from "../types-DaHgOqFX.js";
import { t as FallbackAttempt } from "../model-fallback.types-BQxBBoz4.js";
import { n as createSubsystemLogger } from "../subsystem-CfQVin8T.js";
import { n as getProviderEnvVars } from "../provider-env-vars-tVI_dmyg.js";
import { c as MusicGenerationProvider, d as MusicGenerationResult, f as MusicGenerationSourceImage, l as MusicGenerationProviderCapabilities, s as MusicGenerationOutputFormat, t as GeneratedMusicAsset, u as MusicGenerationRequest } from "../types-D2lwV4a4.js";
import { n as resolveAgentModelPrimaryValue, t as resolveAgentModelFallbackValues } from "../model-input-CkMbo366.js";
import { n as isFailoverError, t as describeFailoverError } from "../failover-error-ddHkjYfv.js";

//#region src/music-generation/model-ref.d.ts
/**
 * Model reference parsing for music generation.
 *
 * Music generation uses the same provider/model ref grammar as other media
 * capabilities, but keeps this wrapper for a dedicated capability boundary.
 */
/** Parse a music generation model ref into provider and model ids. */
declare function parseMusicGenerationModelRef(raw: string | undefined): {
  provider: string;
  model: string;
} | null;
//#endregion
//#region src/music-generation/provider-registry.d.ts
/** List canonical music generation providers available for the current config. */
declare function listMusicGenerationProviders(cfg?: OpenClawConfig): MusicGenerationProviderPlugin[];
/** Resolve a music generation provider by canonical id or alias. */
declare function getMusicGenerationProvider(providerId: string | undefined, cfg?: OpenClawConfig): MusicGenerationProviderPlugin | undefined;
//#endregion
export { type AuthProfileStore, type FallbackAttempt, type GeneratedMusicAsset, type MusicGenerationOutputFormat, type MusicGenerationProvider, type MusicGenerationProviderCapabilities, type MusicGenerationProviderPlugin, type MusicGenerationRequest, type MusicGenerationResult, type MusicGenerationSourceImage, type OpenClawConfig, createSubsystemLogger, describeFailoverError, getMusicGenerationProvider, getProviderEnvVars, isFailoverError, listMusicGenerationProviders, parseMusicGenerationModelRef, resolveAgentModelFallbackValues, resolveAgentModelPrimaryValue };