#!/usr/bin/env node
// Writes a Polder workspace's skills (COD-207) as SKILL.md files for a local
// agent such as Pi, Claude Code or Codex. Polder is the source: a skill changed
// here overwrites the copy on disk, and one removed here is removed there.
//
//   POLDER_SKILLS_URL=https://docs.polder.work POLDER_SKILLS_TOKEN=ptn_… node sync.mjs [--dir ~/.agents/skills]
//
// The token is an integration's secret with the "Read skills" capability.
// Only folders this script made (they hold a `.potion` file) are ever changed
// or removed; a skill of your own with the same name is left alone and reported.
// POTION_URL and POTION_TOKEN still work as the old names.
// Also used by the Pi extension next to it (index.ts) and the Claude Code plugin hook. It lives in the extension's
// folder because Pi does not follow a symlinked extension to files outside it.
import { access, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const MARKER = '.potion';
// The same shape Polder makes slugs in; checked because the server decides the folder name.
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The text of a skill's SKILL.md: Agent Skills frontmatter, then the instructions. */
export function skillFile(skill) {
    // JSON strings are valid YAML double-quoted strings, so colons and newlines in the description are safe.
    return `---\nname: ${skill.slug}\ndescription: ${JSON.stringify(skill.description)}\n---\n\n${skill.instructions.trim()}\n`;
}

async function fetchSkills(url, token) {
    const skills = [];
    let cursor = null;
    do {
        const query = new URLSearchParams({ page_size: '100', ...(cursor ? { start_cursor: cursor } : {}) });
        const res = await fetch(`${url.replace(/\/+$/, '')}/api/v1/skills?${query}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(`Polder answered ${res.status}${body.message ? `: ${body.message}` : ''}`);
        }
        const page = await res.json();
        skills.push(...page.results);
        cursor = page.has_more ? page.next_cursor : null;
    } while (cursor);

    return skills;
}

const exists = (path) =>
    access(path).then(
        () => true,
        () => false,
    );

/**
 * @param {{url?: string, token?: string, dir?: string}} options
 * @returns {Promise<{written: string[], unchanged: string[], removed: string[], conflicts: string[], paths: string[]}>}
 *   `paths` are the skill folders that now hold a skill from Polder.
 */
export async function syncSkills({
    url = process.env.POLDER_SKILLS_URL || process.env.POTION_URL,
    token = process.env.POLDER_SKILLS_TOKEN || process.env.POTION_TOKEN,
    dir = process.env.POLDER_SKILLS_DIR || process.env.POTION_SKILLS_DIR || join(homedir(), '.agents', 'skills'),
} = {}) {
    if (!url || !token) throw new Error('Set POLDER_SKILLS_URL and POLDER_SKILLS_TOKEN.');

    const skills = await fetchSkills(url, token);
    const result = { written: [], unchanged: [], removed: [], conflicts: [], paths: [] };
    await mkdir(dir, { recursive: true });

    for (const skill of skills) {
        if (!SLUG.test(skill.slug)) continue;
        const folder = join(dir, skill.slug);
        const file = join(folder, 'SKILL.md');
        const content = skillFile(skill);

        if ((await exists(folder)) && !(await exists(join(folder, MARKER)))) {
            result.conflicts.push(skill.slug);
            continue;
        }
        result.paths.push(folder);
        if ((await readFile(file, 'utf8').catch(() => null)) === content) {
            result.unchanged.push(skill.slug);
            continue;
        }
        await mkdir(folder, { recursive: true });
        // Write beside it and rename, so an agent reading at that moment never sees half a file.
        await writeFile(`${file}.tmp`, content);
        await rename(`${file}.tmp`, file);
        await writeFile(join(folder, MARKER), `${skill.id}\n`);
        result.written.push(skill.slug);
    }

    // A folder we made for a skill that is gone from Polder.
    const current = new Set(skills.map((s) => s.slug));
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || current.has(entry.name)) continue;
        if (await exists(join(dir, entry.name, MARKER))) {
            await rm(join(dir, entry.name), { recursive: true });
            result.removed.push(entry.name);
        }
    }

    return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const flag = process.argv.indexOf('--dir');
    syncSkills(flag > 0 ? { dir: process.argv[flag + 1] } : {}).then(
        (r) => {
            console.log(`Skills: ${r.written.length} written, ${r.unchanged.length} unchanged, ${r.removed.length} removed.`);
            for (const slug of r.conflicts) console.warn(`Skipped "${slug}": a skill of your own already has that folder name.`);
        },
        (error) => {
            console.error(`Skills not synced: ${error.message}`);
            process.exit(1);
        },
    );
}
