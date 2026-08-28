import { n as zalouserSetupAdapter } from "./setup-core-YieAw3pa.js";
import { t as createZalouserPluginBase } from "./shared-COiqxlH4.js";
import { t as zalouserSetupWizard } from "./setup-surface-DeP7x-78.js";
//#region extensions/zalouser/src/channel.setup.ts
const zalouserSetupPlugin = { ...createZalouserPluginBase({
	setupWizard: zalouserSetupWizard,
	setup: zalouserSetupAdapter
}) };
//#endregion
export { zalouserSetupPlugin as t };
