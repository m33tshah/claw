import { t as definePluginEntry } from "../../plugin-entry-CM_XK0Yw.js";
import { t as buildFalImageGenerationProvider } from "../../image-generation-provider-Y3zhTx2C.js";
import { t as buildFalMusicGenerationProvider } from "../../music-generation-provider-Bj41KgcL.js";
import { t as createFalProvider } from "../../provider-registration-ucUoS7MP.js";
import { t as buildFalVideoGenerationProvider } from "../../video-generation-provider-CJz5Z7-X.js";
var fal_default = definePluginEntry({
	id: "fal",
	name: "fal Provider",
	description: "Bundled fal image, video, and music generation provider",
	register(api) {
		api.registerProvider(createFalProvider());
		api.registerImageGenerationProvider(buildFalImageGenerationProvider());
		api.registerMusicGenerationProvider(buildFalMusicGenerationProvider());
		api.registerVideoGenerationProvider(buildFalVideoGenerationProvider());
	}
});
//#endregion
export { fal_default as default };
