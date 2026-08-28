import { d as MigrationProviderContext, l as MigrationItem } from "../../plugin-entry-R9cUrV0y.js";
import { t as PlannedMigrationTargets } from "../../migration-runtime-v1EJOEos.js";
import { t as HermesSource } from "../../source-BWpYJbX3.js";
//#region extensions/migrate-hermes/auth.d.ts
declare function buildAuthItems(params: {
  ctx: MigrationProviderContext;
  source: HermesSource;
  targets: PlannedMigrationTargets;
}): Promise<MigrationItem[]>;
declare function applyAuthItem(ctx: MigrationProviderContext, item: MigrationItem, targets: PlannedMigrationTargets): Promise<MigrationItem>;
//#endregion
export { applyAuthItem, buildAuthItems };