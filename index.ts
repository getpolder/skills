import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { syncSkills } from './sync.mjs';

// Polder skills (COD-207) in Pi: sync them when Pi starts and on /reload, then
// hand Pi the folders so the session sees them without a restart. Needs
// POLDER_SKILLS_URL and POLDER_SKILLS_TOKEN in the environment; without them it does nothing.
export default function (pi: ExtensionAPI) {
    pi.on('resources_discover', async (_event, ctx) => {
        if (!(process.env.POLDER_SKILLS_URL || process.env.POTION_URL) || !(process.env.POLDER_SKILLS_TOKEN || process.env.POTION_TOKEN)) return;
        try {
            const result = await syncSkills();
            const changed = result.written.length + result.removed.length;
            if (changed > 0) ctx.ui.notify(`Polder skills synced: ${result.written.length} updated, ${result.removed.length} removed.`, 'info');
            if (result.conflicts.length > 0)
                ctx.ui.notify(`Polder skills skipped, you already have one by that name: ${result.conflicts.join(', ')}`, 'warning');
            return { skillPaths: result.paths };
        } catch (error) {
            // Offline or a bad token must never keep Pi from starting.
            ctx.ui.notify(`Polder skills not synced: ${error instanceof Error ? error.message : error}`, 'warning');
        }
    });
}
