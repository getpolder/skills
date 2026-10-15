import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// @ts-expect-error plain .mjs script without types
import { skillFile, syncSkills } from './sync.mjs';

const skill = (slug: string, over: Record<string, string> = {}) => ({
    object: 'skill',
    id: `id-${slug}`,
    name: slug,
    slug,
    description: `About ${slug}: yes`,
    instructions: `Do ${slug}.`,
    ...over,
});

let server: Server;
let dir: string;
let skills: ReturnType<typeof skill>[];
let status: number;
let url: string;

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'polder-skills-'));
    skills = [];
    status = 200;
    // Two skills to a page, so the cursor loop is exercised.
    server = createServer((req, res) => {
        const q = new URL(req.url!, 'http://x').searchParams;
        if (req.headers.authorization !== 'Bearer ptn_ok') status = 401;
        const start = Number(q.get('start_cursor') ?? 0);
        const results = skills.slice(start, start + 2);
        const more = start + 2 < skills.length;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status === 200 ? { results, has_more: more, next_cursor: more ? String(start + 2) : null } : { message: 'nope' }));
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterEach(async () => {
    server.close();
    await rm(dir, { recursive: true, force: true });
});

const sync = () => syncSkills({ url, token: 'ptn_ok', dir });

describe('syncSkills', () => {
    it('writes every skill as a SKILL.md, over all pages, and marks the folder as ours', async () => {
        skills = [skill('a'), skill('b'), skill('c')];

        const result = await sync();

        expect(result.written).toEqual(['a', 'b', 'c']);
        expect(await readFile(join(dir, 'c', 'SKILL.md'), 'utf8')).toBe(skillFile(skills[2]));
        expect(await readFile(join(dir, 'c', '.potion'), 'utf8')).toBe('id-c\n');
        expect(await readFile(join(dir, 'a', 'SKILL.md'), 'utf8')).toBe('---\nname: a\ndescription: "About a: yes"\n---\n\nDo a.\n');
    });

    it('leaves an unchanged skill alone and rewrites a changed one', async () => {
        skills = [skill('a'), skill('b')];
        await sync();
        skills[1] = skill('b', { instructions: 'New.' });

        const result = await sync();

        expect(result.unchanged).toEqual(['a']);
        expect(result.written).toEqual(['b']);
        expect(await readFile(join(dir, 'b', 'SKILL.md'), 'utf8')).toContain('New.');
    });

    it('removes the folder of a skill that is gone, but never one of your own', async () => {
        skills = [skill('a'), skill('b')];
        await sync();
        await mkdir(join(dir, 'mine'));
        await writeFile(join(dir, 'mine', 'SKILL.md'), 'my own');
        skills = [skill('a')];

        const result = await sync();

        expect(result.removed).toEqual(['b']);
        expect((await readdir(dir)).sort()).toEqual(['a', 'mine']);
    });

    it('skips a skill whose folder is one of your own, and says so', async () => {
        await mkdir(join(dir, 'a'));
        await writeFile(join(dir, 'a', 'SKILL.md'), 'my own');
        skills = [skill('a'), skill('b')];

        const result = await sync();

        expect(result.conflicts).toEqual(['a']);
        expect(result.paths).toEqual([join(dir, 'b')]);
        expect(await readFile(join(dir, 'a', 'SKILL.md'), 'utf8')).toBe('my own');
    });

    it('ignores a slug that is not a plain folder name', async () => {
        skills = [skill('../evil'), skill('ok')];

        await sync();

        expect(await readdir(dir)).toEqual(['ok']);
    });

    it('fails clearly on a bad token or missing settings, leaving the folders as they were', async () => {
        skills = [skill('a')];
        await sync();

        await expect(syncSkills({ url, token: 'wrong', dir })).rejects.toThrow('Polder answered 401: nope');
        await expect(syncSkills({ url: '', token: '', dir })).rejects.toThrow('Set POLDER_URL and POLDER_TOKEN.');
        expect(await readdir(dir)).toEqual(['a']);
    });
});
