/**
 * MESNIUM WORKFLOW ENGINE — TEMPLATES REGISTRY (PHASE 4)
 * 
 * Provides centralized cataloging and instantiation of reusable workflow templates.
 */

import { BUILTIN_WORKFLOW_TEMPLATES } from './workflow-templates.js';
import { assertValidWorkspaceId, validateWorkflowDefinition } from './validator.js';
import { WorkflowStatus } from './types.js';

export class MesniumWorkflowRegistry {
  constructor() {
    this.templates = new Map();
    this._initializeBuiltins();
  }

  _initializeBuiltins() {
    for (const tmpl of BUILTIN_WORKFLOW_TEMPLATES) {
      this.templates.set(tmpl.id, tmpl);
    }
  }

  registerTemplate(templateDef) {
    if (!templateDef || typeof templateDef !== 'object') {
      throw new Error('Template registration error: Invalid template definition.');
    }
    if (!templateDef.id || typeof templateDef.id !== 'string') {
      throw new Error('Template registration error: "id" is required.');
    }
    if (!templateDef.name || typeof templateDef.name !== 'string') {
      throw new Error('Template registration error: "name" is required.');
    }
    this.templates.set(templateDef.id, JSON.parse(JSON.stringify(templateDef)));
  }

  getTemplate(templateId) {
    if (!templateId) return null;
    const tmpl = this.templates.get(templateId);
    if (!tmpl) return null;
    return JSON.parse(JSON.stringify(tmpl));
  }

  listTemplates(category = null) {
    const list = Array.from(this.templates.values());
    if (category) {
      return list.filter(t => t.category === category).map(t => JSON.parse(JSON.stringify(t)));
    }
    return list.map(t => JSON.parse(JSON.stringify(t)));
  }

  /**
   * Instantiates a template into a concrete workflow definition for a specific workspace.
   */
  instantiateWorkflow(templateId, workspaceId, overrides = {}) {
    assertValidWorkspaceId(workspaceId, 'instantiateWorkflow');
    const tmpl = this.getTemplate(templateId);
    if (!tmpl) {
      throw new Error(`Workflow template "${templateId}" not found in registry.`);
    }

    const now = Date.now();
    const wfId = overrides.id || `wf_${now}_${Math.random().toString(36).slice(2, 7)}`;

    // Merge step overrides if provided
    let mergedSteps = JSON.parse(JSON.stringify(tmpl.steps || []));
    if (Array.isArray(overrides.steps)) {
      mergedSteps = overrides.steps;
    } else if (overrides.stepOverrides && typeof overrides.stepOverrides === 'object') {
      mergedSteps = mergedSteps.map(st => {
        const stepOver = overrides.stepOverrides[st.id];
        if (stepOver && typeof stepOver === 'object') {
          return {
            ...st,
            ...stepOver,
            input: { ...(st.input || {}), ...(stepOver.input || {}) }
          };
        }
        return st;
      });
    }

    const rawWorkflow = {
      id: wfId,
      workspaceId,
      templateId: tmpl.id,
      name: overrides.name || tmpl.name,
      description: overrides.description || tmpl.description,
      version: tmpl.version || '1.0.0',
      status: overrides.status || WorkflowStatus.ACTIVE,
      trigger: overrides.trigger || tmpl.trigger || { type: 'manual' },
      conditions: Array.isArray(overrides.conditions) ? overrides.conditions : (tmpl.conditions || []),
      steps: mergedSteps,
      requiredCapabilities: Array.isArray(overrides.requiredCapabilities) 
        ? overrides.requiredCapabilities 
        : (tmpl.requiredCapabilities || []),
      metadata: {
        ...(tmpl.metadata || {}),
        ...(overrides.metadata || {}),
        instantiatedFrom: tmpl.id,
        instantiatedAt: now
      },
      createdAt: now,
      updatedAt: now
    };

    return validateWorkflowDefinition(rawWorkflow, workspaceId);
  }
}

let sharedRegistry = null;

export function getSharedWorkflowRegistry() {
  if (!sharedRegistry) {
    sharedRegistry = new MesniumWorkflowRegistry();
  }
  return sharedRegistry;
}
