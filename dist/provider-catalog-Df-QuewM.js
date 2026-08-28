import { r as buildMetaCatalogModels, t as META_BASE_URL } from "./models-iHXPHUo6.js";
//#region extensions/meta/provider-catalog.ts
/** Builds the Meta OpenAI-compatible model provider config. */
function buildMetaProvider() {
	return {
		baseUrl: META_BASE_URL,
		api: "openai-responses",
		models: buildMetaCatalogModels()
	};
}
//#endregion
export { buildMetaProvider as t };
