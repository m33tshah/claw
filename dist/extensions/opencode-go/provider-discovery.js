import { n as buildStaticOpencodeGoProviderConfig } from "../../provider-catalog-C7COmxqK.js";
//#region extensions/opencode-go/provider-discovery.ts
const opencodeGoProviderDiscovery = {
	id: "opencode-go",
	label: "OpenCode Go",
	docsPath: "/providers/models",
	auth: [],
	staticCatalog: {
		order: "simple",
		run: async () => ({ provider: buildStaticOpencodeGoProviderConfig() })
	}
};
//#endregion
export { opencodeGoProviderDiscovery as default };
