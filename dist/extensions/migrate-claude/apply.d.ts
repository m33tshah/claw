import { d as MigrationProviderContext, s as MigrationApplyResult, u as MigrationPlan } from "../../plugin-entry-R9cUrV0y.js";

//#region extensions/migrate-claude/apply.d.ts
declare function applyClaudePlan(params: {
  ctx: MigrationProviderContext;
  plan?: MigrationPlan;
  runtime?: MigrationProviderContext["runtime"];
}): Promise<MigrationApplyResult>;
//#endregion
export { applyClaudePlan };