/**
 * MESNIUM WORKFLOW ENGINE — UNIFIED FACADE (PHASE 4)
 * 
 * Central coordinator providing:
 * - Workflow Definition Persistence Store (tenant-isolated)
 * - Workflow Run History & State Persistence Store (restart-recoverable)
 * - Built-in Capability & Workflow Templates Registry
 * - Multi-Step Execution & Orchestration Engine
 * - Action Gatekeeper Approval-Paused Resumption
 */

import { MesniumWorkflowStore } from './workflow-store.js';
import { MesniumWorkflowRunStore } from './workflow-run-store.js';
import { getSharedWorkflowRegistry } from './workflow-registry.js';
import { MesniumWorkflowEngine } from './workflow-engine.js';
import { WorkflowStatus } from './types.js';
import { assertValidWorkspaceId } from './validator.js';

export * from './types.js';
export * from './validator.js';
export * from './workflow-templates.js';
export { MesniumWorkflowStore } from './workflow-store.js';
export { MesniumWorkflowRunStore } from './workflow-run-store.js';
export { MesniumWorkflowRegistry, getSharedWorkflowRegistry } from './workflow-registry.js';
export { MesniumWorkflowEngine } from './workflow-engine.js';

export class MesniumWorkflowManager {
  constructor(options = {}) {
    this.workflowStore = new MesniumWorkflowStore(options);
    this.runStore = new MesniumWorkflowRunStore(options);
    this.registry = getSharedWorkflowRegistry();
    this.engine = new MesniumWorkflowEngine({
      workflowStore: this.workflowStore,
      runStore: this.runStore,
      ...options
    });
  }

  listWorkflows(workspaceId) {
    return this.workflowStore.listWorkflows(workspaceId);
  }

  getWorkflow(workspaceId, workflowId) {
    return this.workflowStore.getWorkflow(workspaceId, workflowId);
  }

  createWorkflow(workspaceId, definition) {
    return this.workflowStore.createWorkflow(workspaceId, definition);
  }

  updateWorkflow(workspaceId, workflowId, patch) {
    return this.workflowStore.updateWorkflow(workspaceId, workflowId, patch);
  }

  deleteWorkflow(workspaceId, workflowId) {
    return this.workflowStore.deleteWorkflow(workspaceId, workflowId);
  }

  activateWorkflow(workspaceId, workflowId) {
    return this.workflowStore.setStatus(workspaceId, workflowId, WorkflowStatus.ACTIVE);
  }

  pauseWorkflow(workspaceId, workflowId) {
    return this.workflowStore.setStatus(workspaceId, workflowId, WorkflowStatus.PAUSED);
  }

  runWorkflow(workspaceId, workflowId, initialInput = {}, triggerSource = 'manual') {
    return this.engine.startWorkflow(workspaceId, workflowId, initialInput, triggerSource);
  }

  resumeRun(workspaceId, runId) {
    return this.engine.resumeWorkflowRun(workspaceId, runId);
  }

  cancelRun(workspaceId, runId, reason = 'Cancelled by user') {
    return this.engine.cancelWorkflowRun(workspaceId, runId, reason);
  }

  getRun(workspaceId, runId) {
    return this.runStore.getRun(workspaceId, runId);
  }

  listRuns(workspaceId, options = {}) {
    return this.runStore.listRuns(workspaceId, options);
  }

  listTemplates(category = null) {
    return this.registry.listTemplates(category);
  }

  getTemplate(templateId) {
    return this.registry.getTemplate(templateId);
  }

  instantiateTemplate(templateId, workspaceId, overrides = {}) {
    assertValidWorkspaceId(workspaceId, 'instantiateTemplate');
    const workflowDef = this.registry.instantiateWorkflow(templateId, workspaceId, overrides);
    return this.workflowStore.createWorkflow(workspaceId, workflowDef);
  }
}

let sharedWorkflowManager = null;

export function getSharedWorkflowManager() {
  if (!sharedWorkflowManager) {
    sharedWorkflowManager = new MesniumWorkflowManager();
  }
  return sharedWorkflowManager;
}
