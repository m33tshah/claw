import { l as MigrationItem } from "../../plugin-entry-R9cUrV0y.js";
import { t as PlannedMigrationTargets } from "../../migration-runtime-v1EJOEos.js";
import { t as HermesSource } from "../../source-BWpYJbX3.js";
//#region extensions/migrate-hermes/skills.d.ts
declare function buildSkillItems(params: {
  source: HermesSource;
  targets: PlannedMigrationTargets;
  overwrite?: boolean;
}): Promise<MigrationItem[]>;
//#endregion
export { buildSkillItems };