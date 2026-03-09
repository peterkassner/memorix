/**
 * End-to-end test for mini-skills against real ~/.memorix/data/ directory.
 * Tests the full lifecycle: search observations → promote → list → inject → delete.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import {
  promoteToMiniSkill,
  loadAllMiniSkills,
  deleteMiniSkill,
  formatMiniSkillsForInjection,
} from '../../src/skills/mini-skills.js';
import { loadObservationsJson } from '../../src/store/persistence.js';

const REAL_DATA_DIR = path.join(os.homedir(), '.memorix', 'data');

describe('mini-skills e2e (real data)', () => {
  let createdSkillId: number | null = null;

  it('should find real observations in ~/.memorix/data/', async () => {
    let exists = false;
    try {
      await fs.access(path.join(REAL_DATA_DIR, 'observations.json'));
      exists = true;
    } catch { /* no data */ }

    if (!exists) {
      console.log('⚠️  No real data found at', REAL_DATA_DIR, '— skipping e2e');
      return;
    }

    const obs = await loadObservationsJson(REAL_DATA_DIR) as any[];
    console.log(`📊 Found ${obs.length} observations in real data`);
    expect(obs.length).toBeGreaterThan(0);

    // Show first 5 observations
    for (const o of obs.slice(0, 5)) {
      console.log(`  #${o.id} [${o.type}] ${o.title}`);
    }
  });

  it('should promote a real observation to mini-skill', async () => {
    const obs = await loadObservationsJson(REAL_DATA_DIR) as any[];
    if (obs.length === 0) return;

    // Pick the first gotcha or decision, or just the first one
    const candidate = obs.find((o: any) => o.type === 'gotcha' || o.type === 'decision') || obs[0];

    console.log(`🎯 Promoting observation #${candidate.id}: "${candidate.title}"`);

    const skill = await promoteToMiniSkill(
      REAL_DATA_DIR,
      candidate.projectId || 'test',
      [candidate],
      { trigger: 'E2E test trigger', instruction: 'E2E test instruction' },
    );

    createdSkillId = skill.id;

    console.log(`✅ Created mini-skill #${skill.id}`);
    console.log(`   Title: ${skill.title}`);
    console.log(`   Instruction: ${skill.instruction}`);
    console.log(`   Trigger: ${skill.trigger}`);
    console.log(`   Facts: ${skill.facts.length}`);
    console.log(`   Tags: ${skill.tags.join(', ')}`);

    expect(skill.id).toBeGreaterThan(0);
    expect(skill.title).toBeTruthy();
    expect(skill.sourceObservationIds).toContain(candidate.id);
  });

  it('should list mini-skills from real data', async () => {
    let hasData = false;
    try {
      await fs.access(path.join(REAL_DATA_DIR, 'mini-skills.json'));
      hasData = true;
    } catch { /* no data */ }

    if (!hasData) {
      console.log('⚠️  No mini-skills.json found — skipping');
      return;
    }

    const skills = await loadAllMiniSkills(REAL_DATA_DIR);
    console.log(`📋 Total mini-skills: ${skills.length}`);

    for (const s of skills) {
      console.log(`  #${s.id} "${s.title}" (used ${s.usedCount}x)`);
    }

    expect(skills.length).toBeGreaterThan(0);
  });

  it('should format mini-skills for session injection', async () => {
    const skills = await loadAllMiniSkills(REAL_DATA_DIR);
    if (skills.length === 0) return;

    const formatted = formatMiniSkillsForInjection(skills);
    console.log('\n📝 Session injection preview:');
    console.log('─'.repeat(60));
    console.log(formatted);
    console.log('─'.repeat(60));

    expect(formatted).toContain('🎯 Project Mini-Skills');
    expect(formatted).toContain('**Do**:');
    expect(formatted).toContain('**When**:');
  });

  it('should clean up test mini-skill', async () => {
    if (createdSkillId == null) return;

    console.log(`🧹 Cleaning up test mini-skill #${createdSkillId}`);
    const deleted = await deleteMiniSkill(REAL_DATA_DIR, createdSkillId);
    expect(deleted).toBe(true);

    const remaining = await loadAllMiniSkills(REAL_DATA_DIR);
    const stillExists = remaining.find(s => s.id === createdSkillId);
    expect(stillExists).toBeUndefined();
    console.log(`✅ Cleaned up. ${remaining.length} mini-skills remaining.`);
  });
});
