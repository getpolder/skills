# Polder skills

Polder's skills (the Skills database, opened from Settings → Skills) can be written as `SKILL.md` files for a local agent such as [Pi](https://github.com/earendil-works/pi), Claude Code or Codex. Polder is the source: a skill you change in Polder overwrites the copy on disk, and one you remove is removed there. Nothing is sent back.

## Set it up

1. In Polder: **Settings → Workspace → Connections → New integration**, with the **Read skills** capability. Copy its secret (`ptn_…`). The integration needs no connected pages.
2. Put the address and secret where your agent starts, for example in `~/.zshrc`:

   ```sh
   export POLDER_URL=https://polder.example.com
   export POLDER_TOKEN=ptn_…
   ```

## Pi: sync by itself

Link the extension once:

```sh
ln -s /path/to/skills ~/.pi/agent/extensions/polder-skills
```

From then on Pi syncs when it starts and on `/reload`, and the skills are available in that same session. If Polder can't be reached, Pi starts as usual and shows a warning; the copies from the last sync stay.

## Claude Code: install the plugin

Inside Claude Code, once per colleague:

```
/plugin marketplace add getpolder/skills
/plugin install polder-skills@polder
```

From then on the skills are synced into `~/.claude/skills` every time a session starts. `POLDER_URL` and `POLDER_TOKEN` must be in the environment Claude Code starts in; without them the plugin does nothing. If Polder can't be reached the hook fails quietly and the copies from the last sync stay. Update the plugin with `/plugin marketplace update polder`.

## Claude desktop and Cowork: upload a plugin

These apps can't read a folder on your disk, so there is nothing to sync into; you upload the skills instead. Build a plugin from the script's output and zip it:

```sh
mkdir -p polder-skills/.claude-plugin
node sync.mjs --dir polder-skills/skills
echo '{"name":"polder-skills","description":"Skills from Polder","version":"1.0.0"}' > polder-skills/.claude-plugin/plugin.json
(cd polder-skills && zip -r ../polder-skills.zip . -x '*/.potion')
```

Upload `polder-skills.zip` in Cowork under **Plugins** (or add the skills in Claude desktop under **Settings → Capabilities → Skills**). Run the commands again and upload again after a skill changes in Polder; this is a manual step, not automatic like Pi and Claude Code.

## Any other agent: run the script

```sh
node sync.mjs            # into ~/.agents/skills
node sync.mjs --dir ~/.claude/skills
```

To run it on a schedule on a Mac, a `launchd` job in `~/Library/LaunchAgents/nl.polder.skills.plist`, loaded with `launchctl load`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>nl.polder.skills</string>
  <key>ProgramArguments</key>
  <array><string>/opt/homebrew/bin/node</string><string>/path/to/skills/sync.mjs</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>POLDER_URL</key><string>https://polder.example.com</string><key>POLDER_TOKEN</key><string>ptn_…</string></dict>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>3600</integer>
</dict>
</plist>
```

## What it touches

Each skill gets its own folder named after its slug, with a `SKILL.md` and a `.potion` marker. Only folders with that marker are ever changed or removed. If you already have a skill of your own with the same folder name, it is left alone and reported.
