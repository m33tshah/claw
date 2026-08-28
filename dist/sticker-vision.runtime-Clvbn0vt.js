import { S as findModelInCatalog } from "./model-selection-shared-iHJcI8fT.js";
import { c as resolveDefaultModelForAgent } from "./model-selection-B9dihan1.js";
import { i as modelSupportsVision, n as loadModelCatalog } from "./model-catalog-BfvH9gPq.js";
import "./agent-runtime-JUjSgUZE.js";
//#region extensions/telegram/src/sticker-vision.runtime.ts
async function resolveStickerVisionSupportRuntime(params) {
	const catalog = await loadModelCatalog({ config: params.cfg });
	const defaultModel = resolveDefaultModelForAgent({
		cfg: params.cfg,
		agentId: params.agentId
	});
	const entry = findModelInCatalog(catalog, defaultModel.provider, defaultModel.model);
	if (!entry) return false;
	return modelSupportsVision(entry);
}
//#endregion
export { resolveStickerVisionSupportRuntime };
