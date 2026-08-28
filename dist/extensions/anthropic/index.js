import { t as definePluginEntry } from "../../plugin-entry-CM_XK0Yw.js";
import { n as registerAnthropicPlugin } from "../../register.runtime-CcW2y9o2.js";
//#region extensions/anthropic/index.ts
/**
* Anthropic provider plugin entry. It registers Claude API auth, Claude CLI
* backend support, media understanding, stream wrappers, and usage reporting.
*/
/** Provider entry for Anthropic API and Claude CLI runtime surfaces. */
var anthropic_default = definePluginEntry({
	id: "anthropic",
	name: "Anthropic Provider",
	description: "Bundled Anthropic provider plugin",
	register(api) {
		return registerAnthropicPlugin(api);
	}
});
//#endregion
export { anthropic_default as default };
