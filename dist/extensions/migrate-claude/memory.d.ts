import { l as MigrationItem } from "../../plugin-entry-R9cUrV0y.js";
import { t as ClaudeSource } from "../../source-Czne5iNW.js";
import { t as PlannedMigrationTargets } from "../../migration-runtime-v1EJOEos.js";
//#region extensions/migrate-claude/memory.d.ts
declare function buildMemoryItems(params: {
  source: ClaudeSource;
  targets: PlannedMigrationTargets;
  overwrite?: boolean;
}): Promise<MigrationItem[]>;
//#endregion
export { buildMemoryItems };