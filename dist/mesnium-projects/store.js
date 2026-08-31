/**
 * MESNIUM PROJECTS STORE (PHASE 18)
 * 
 * Manages persistent Project workspaces with server-side file storage:
 * - Projects metadata persisted on disk in ~/.openclaw/mesnium-projects/projects.json
 * - Project files stored on disk in ~/.openclaw/mesnium-projects/files/<projectId>/
 * - NO large base64 file payloads in client localStorage.
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

function getProjectsRootDir() {
  const base = process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw');
  const dir = path.join(base, 'mesnium-projects');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getProjectsFilePath() {
  return path.join(getProjectsRootDir(), 'projects.json');
}

function getProjectFilesDir(projectId) {
  const safeId = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = path.join(getProjectsRootDir(), 'files', safeId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function loadProjects() {
  const file = getProjectsFilePath();
  if (!fs.existsSync(file)) {
    // Default initial projects
    const defaults = [
      {
        id: 'proj_marketing',
        name: 'Marketing',
        description: 'Campaign planning, brand assets, and competitor research',
        instructions: 'You are our senior marketing strategist. Follow our brand voice and optimize for high conversion and clear positioning.',
        files: [],
        conversationIds: [],
        createdAt: Date.now() - 86400000 * 2,
        updatedAt: Date.now() - 86400000 * 2
      },
      {
        id: 'proj_sales',
        name: 'Sales',
        description: 'Lead qualification, pricing sheets, and sales playbooks',
        instructions: 'You are our sales execution partner. Focus on deal velocity, objection handling, and clear commercial terms.',
        files: [],
        conversationIds: [],
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now() - 86400000
      },
      {
        id: 'proj_operations',
        name: 'Operations',
        description: 'SOPs, vendor lists, and operational checklists',
        instructions: 'You are our business operations coordinator. Prioritize compliance, efficiency, and risk reduction.',
        files: [],
        conversationIds: [],
        createdAt: Date.now() - 3600000 * 5,
        updatedAt: Date.now() - 3600000 * 5
      }
    ];
    saveProjects(defaults);
    return defaults;
  }
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[Mesnium Projects] Error loading projects:', err);
    return [];
  }
}

function saveProjects(projects) {
  const file = getProjectsFilePath();
  try {
    fs.writeFileSync(file, JSON.stringify(projects, null, 2), 'utf8');
  } catch (err) {
    console.error('[Mesnium Projects] Error saving projects:', err);
  }
}

export class MesniumProjectManager {
  listProjects() {
    return loadProjects();
  }

  getProject(projectId) {
    const projects = loadProjects();
    return projects.find(p => p.id === projectId) || null;
  }

  createProject(data) {
    const projects = loadProjects();
    const id = data.id || ('proj_' + (data.name || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now().toString(36));
    const now = Date.now();
    const newProj = {
      id,
      name: data.name || 'Untitled Project',
      description: data.description || '',
      instructions: data.instructions || '',
      files: [],
      conversationIds: [],
      createdAt: now,
      updatedAt: now
    };
    projects.unshift(newProj);
    saveProjects(projects);
    return newProj;
  }

  updateProject(projectId, updates) {
    const projects = loadProjects();
    const idx = projects.findIndex(p => p.id === projectId);
    if (idx === -1) throw new Error(`Project ${projectId} not found`);

    const p = projects[idx];
    if (updates.name !== undefined) p.name = updates.name;
    if (updates.description !== undefined) p.description = updates.description;
    if (updates.instructions !== undefined) p.instructions = updates.instructions;
    if (updates.conversationIds !== undefined) p.conversationIds = updates.conversationIds;
    p.updatedAt = Date.now();

    projects[idx] = p;
    saveProjects(projects);
    return p;
  }

  deleteProject(projectId) {
    const projects = loadProjects();
    const filtered = projects.filter(p => p.id !== projectId);
    saveProjects(filtered);

    // Clean up project files directory
    try {
      const filesDir = getProjectFilesDir(projectId);
      if (fs.existsSync(filesDir)) {
        fs.rmSync(filesDir, { recursive: true, force: true });
      }
    } catch (_) {}

    return { success: true, deletedId: projectId };
  }

  addProjectFile(projectId, fileData) {
    const projects = loadProjects();
    const idx = projects.findIndex(p => p.id === projectId);
    if (idx === -1) throw new Error(`Project ${projectId} not found`);

    const project = projects[idx];
    const fileId = fileData.id || ('f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
    const filename = fileData.name || 'file.bin';
    const targetDir = getProjectFilesDir(projectId);
    const targetPath = path.join(targetDir, filename);

    // Save actual file to disk if base64 provided
    if (fileData.base64) {
      const buffer = Buffer.from(fileData.base64, 'base64');
      fs.writeFileSync(targetPath, buffer);
    } else if (fileData.content) {
      fs.writeFileSync(targetPath, fileData.content, 'utf8');
    }

    const fileMeta = {
      id: fileId,
      name: filename,
      size: fileData.size || (fs.existsSync(targetPath) ? fs.statSync(targetPath).size : 0),
      type: fileData.type || 'application/octet-stream',
      path: targetPath,
      uploadedAt: Date.now()
    };

    project.files = (project.files || []).filter(f => f.name !== filename);
    project.files.push(fileMeta);
    project.updatedAt = Date.now();

    projects[idx] = project;
    saveProjects(projects);
    return fileMeta;
  }

  removeProjectFile(projectId, fileId) {
    const projects = loadProjects();
    const idx = projects.findIndex(p => p.id === projectId);
    if (idx === -1) throw new Error(`Project ${projectId} not found`);

    const project = projects[idx];
    const file = (project.files || []).find(f => f.id === fileId || f.name === fileId);
    if (file && file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (_) {}
    }

    project.files = (project.files || []).filter(f => f.id !== fileId && f.name !== fileId);
    project.updatedAt = Date.now();

    projects[idx] = project;
    saveProjects(projects);
    return { success: true, removedFileId: fileId };
  }

  getProjectContext(projectId) {
    const project = this.getProject(projectId);
    if (!project) return null;
    return {
      id: project.id,
      name: project.name,
      instructions: project.instructions,
      files: (project.files || []).map(f => ({
        id: f.id,
        name: f.name,
        size: f.size,
        type: f.type,
        path: f.path
      }))
    };
  }
}

let sharedProjectManager = null;

export function getSharedProjectManager() {
  if (!sharedProjectManager) {
    sharedProjectManager = new MesniumProjectManager();
  }
  return sharedProjectManager;
}
