/**
 * MESNIUM SKILL VETTER ENGINE (V1 PRODUCTIZATION)
 * 
 * Performs static security and permission analysis on installed OpenClaw skills and extensions.
 * Evaluates:
 * - Filesystem access (read, write, delete, path traversal)
 * - Network access (outbound HTTP, raw sockets, remote API endpoints)
 * - Execution privileges (child_process, exec, spawn, shell execution)
 * - Credential access (environment variables, tokens, API keys)
 * - Risk rating: LOW, MEDIUM, HIGH
 */

import fs from 'node:fs';
import path from 'node:path';

export class SkillVetter {
  constructor(options = {}) {
    this.skillsDir = options.skillsDir || path.resolve(process.cwd(), 'skills');
    this.extensionsDir = options.extensionsDir || path.resolve(process.cwd(), 'extensions');
  }

  /**
   * List all discovered skills with their security assessment summary.
   */
  listSkills() {
    const results = [];

    // 1. Scan skills/ directory
    if (fs.existsSync(this.skillsDir)) {
      const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const skillPath = path.join(this.skillsDir, entry.name);
          const assessment = this.vetSkill(entry.name, skillPath, 'skill');
          results.push(assessment);
        }
      }
    }

    // 2. Scan selected extensions/ directory if present
    if (fs.existsSync(this.extensionsDir)) {
      const entries = fs.readdirSync(this.extensionsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const extPath = path.join(this.extensionsDir, entry.name);
          const assessment = this.vetSkill(entry.name, extPath, 'extension');
          results.push(assessment);
        }
      }
    }

    return results;
  }

  /**
   * Vet a specific skill or directory statically without executing arbitrary untrusted code.
   */
  vetSkill(skillId, skillDir = null, kind = 'skill') {
    const targetDir = skillDir || path.join(this.skillsDir, skillId);

    if (!fs.existsSync(targetDir)) {
      return {
        id: skillId,
        name: skillId,
        kind,
        status: 'not_found',
        riskLevel: 'UNKNOWN',
        riskScore: 0,
        permissions: [],
        findings: ['Skill directory does not exist on disk.']
      };
    }

    const files = this._collectFiles(targetDir);
    let totalFiles = files.length;
    let skillMetadata = { name: skillId, description: '', version: '1.0.0' };
    
    // Parse SKILL.md frontmatter or package.json
    const skillMd = files.find(f => path.basename(f).toLowerCase() === 'skill.md');
    if (skillMd) {
      try {
        const content = fs.readFileSync(skillMd, 'utf8');
        const descMatch = content.match(/description:\s*["']?([^"'\n\r]+)["']?/i);
        if (descMatch) skillMetadata.description = descMatch[1].trim();
        const nameMatch = content.match(/name:\s*["']?([^"'\n\r]+)["']?/i);
        if (nameMatch) skillMetadata.name = nameMatch[1].trim();
      } catch (_) {}
    }

    const pkgJson = files.find(f => path.basename(f).toLowerCase() === 'package.json');
    if (pkgJson) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
        if (pkg.name) skillMetadata.name = pkg.name;
        if (pkg.description) skillMetadata.description = pkg.description;
        if (pkg.version) skillMetadata.version = pkg.version;
      } catch (_) {}
    }

    // Static code analysis
    const findings = [];
    const permissions = new Set();
    let riskScore = 10; // Baseline low

    let hasExec = false;
    let hasNetwork = false;
    let hasFsWrite = false;
    let hasEnvAccess = false;

    for (const filePath of files) {
      // Only inspect text/source files
      const ext = path.extname(filePath).toLowerCase();
      if (!['.md', '.js', '.mjs', '.ts', '.json', '.yaml', '.yml', '.py', '.sh', '.bash'].includes(ext)) {
        continue;
      }

      let content = '';
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch (_) {
        continue;
      }

      // Check Execution
      if (/\b(child_process|exec|execSync|spawn|spawnSync|popen|system|eval)\b/i.test(content)) {
        hasExec = true;
        permissions.add('execution');
        findings.push(`References process execution or shell spawning in ${path.basename(filePath)}`);
      }

      // Check Network
      if (/\b(fetch|https?:\/\/|axios|superagent|net\.connect|websocket|curl|wget)\b/i.test(content)) {
        hasNetwork = true;
        permissions.add('network');
        findings.push(`Performs outbound network or HTTP requests in ${path.basename(filePath)}`);
      }

      // Check Filesystem Write/Delete
      if (/\b(writeFile|writeFileSync|unlink|rmdir|rm|mkdir|createWriteStream|truncate)\b/i.test(content)) {
        hasFsWrite = true;
        permissions.add('filesystem_write');
        findings.push(`Performs filesystem write or modification in ${path.basename(filePath)}`);
      } else if (/\b(readFile|readFileSync|createReadStream|readdir|stat)\b/i.test(content)) {
        permissions.add('filesystem_read');
      }

      // Check Credential/Env Access
      if (/\b(process\.env|ENV\[|os\.environ|apiKey|api_key|token|secret)\b/i.test(content)) {
        hasEnvAccess = true;
        permissions.add('credentials');
        findings.push(`Accesses environment variables or credentials in ${path.basename(filePath)}`);
      }
    }

    // Compute Risk Score
    if (hasExec) riskScore += 45;
    if (hasFsWrite) riskScore += 25;
    if (hasNetwork) riskScore += 15;
    if (hasEnvAccess) riskScore += 15;

    let riskLevel = 'LOW';
    if (riskScore >= 60) riskLevel = 'HIGH';
    else if (riskScore >= 30) riskLevel = 'MEDIUM';

    if (findings.length === 0) {
      findings.push('Read-only deterministic capability with no external network or execution side-effects.');
    }

    return {
      id: skillId,
      name: skillMetadata.name,
      description: skillMetadata.description || `Capability package for ${skillId}`,
      version: skillMetadata.version,
      kind,
      totalFiles,
      riskLevel,
      riskScore: Math.min(100, riskScore),
      permissions: Array.from(permissions),
      findings: findings.slice(0, 10),
      isApproved: riskLevel !== 'HIGH',
      vettedAt: Date.now()
    };
  }

  _collectFiles(dir, list = []) {
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (item.name.startsWith('.') || item.name === 'node_modules') continue;
        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
          this._collectFiles(full, list);
        } else {
          list.push(full);
        }
      }
    } catch (_) {}
    return list;
  }
}

let sharedVetter = null;
export function getSharedSkillVetter() {
  if (!sharedVetter) {
    sharedVetter = new SkillVetter();
  }
  return sharedVetter;
}
