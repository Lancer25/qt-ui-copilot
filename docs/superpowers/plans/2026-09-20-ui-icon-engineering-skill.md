# UI Icon Engineering Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create and validate a reusable personal skill that prevents font-glyph icon regressions and guides reliable SVG alignment and DPI verification.

**Architecture:** Install a focused `SKILL.md` under the personal Codex skills directory and keep objective evaluation prompts beside it. The skill routes icon work through repository discovery, vector reuse, structural tests, and real-render verification instead of pixel nudging font characters.

**Tech Stack:** Markdown skill instructions, JSON evaluations, Skill Creator validation scripts, Codex personal skills

**Spec:** `docs/superpowers/specs/2026-09-20-ui-icon-engineering-skill-design.md`

## Global Constraints

- The skill is general-purpose across desktop and Web UI projects.
- Formal UI icons must not use Unicode symbols, symbol fonts, or Emoji unless the user explicitly requests a textual symbol.
- Prefer the repository's existing SVG or icon component before adding a dependency or drawing a new icon.
- Validate actual rendering at 100% and 125% DPI when the target platform supports it.
- Keep the skill body under 500 lines and use imperative, rationale-driven instructions.

---

### Task 1: Create the personal skill

**Files:**
- Create: `C:/Users/Lancer/.codex/skills/ui-icon-engineering/SKILL.md`

**Interfaces:**
- Consumes: a UI implementation or review request involving icons.
- Produces: a root-cause-driven icon implementation and verification report.

- [ ] **Step 1: Create the skill directory and draft**

Create `SKILL.md` with this frontmatter:

```yaml
---
name: ui-icon-engineering
description: Diagnose, implement, replace, or review UI icons with reliable SVG geometry, visual alignment, shared icon-system reuse, state consistency, and DPI verification. Use this skill whenever a user mentions misaligned, blurry, inconsistent, ugly, wrongly sized, font-based, Unicode, Emoji, toolbar, button, input, or status icons, even if they only ask for a small icon adjustment.
---
```

The body must implement these ordered sections:

1. `Start with evidence`: inspect existing icon resources and the actual rendered result.
2. `Choose the source`: reuse an existing vector component, then existing asset, then create a minimal SVG.
3. `Avoid font-glyph traps`: reject Unicode, Emoji, symbol fonts, and baseline nudges for formal icons.
4. `Align the full control`: inspect container, SVG bounds, label, badge, states, and optical balance.
5. `Verify structurally`: assert an SVG is rendered and the legacy glyph is absent.
6. `Verify visually`: render at 100% and 125% DPI and inspect relevant states.
7. `Report`: root cause, source, changes, validation matrix, and artifact paths.

- [ ] **Step 2: Validate skill structure**

Run:

```powershell
python C:\Users\Lancer\.agents\skills\skill-creator\scripts\quick_validate.py C:\Users\Lancer\.codex\skills\ui-icon-engineering
```

Expected: validation succeeds with valid frontmatter and no structural errors.

---

### Task 2: Add objective evaluation cases

**Files:**
- Create: `C:/Users/Lancer/.codex/skills/ui-icon-engineering/evals/evals.json`

**Interfaces:**
- Consumes: the three scenarios defined in the approved spec.
- Produces: realistic prompts and expected outcomes suitable for with-skill and baseline comparison.

- [ ] **Step 1: Write three evaluation prompts**

Create `evals.json` with:

```json
{
  "skill_name": "ui-icon-engineering",
  "evals": [
    {
      "id": 1,
      "prompt": "这个 React 按钮里的四宫格图标用了字符 ⊞，在 Windows 上总是比文字低一点。项目已经有 WorkspaceIcon 组件，请修复并验证，不要只调 padding。",
      "expected_output": "复用现有 SVG 组件，移除字体字符和基线补偿，增加 SVG 结构断言并进行实际视觉验证。",
      "files": []
    },
    {
      "id": 2,
      "prompt": "请统一这个 Qt/Electron 工具栏里的图标。目前混用了 Emoji、Unicode 箭头和 SVG，还要保证 hover、选中、禁用状态一致。",
      "expected_output": "审查现有图标系统并统一到向量资源，覆盖尺寸、描边、颜色和交互状态，不引入风格冲突的第二套图标。",
      "files": []
    },
    {
      "id": 3,
      "prompt": "图标在 100% 缩放时看起来正常，但 Windows 125% DPI 下会向右下偏。请定位根因、修复并给出验证证据。",
      "expected_output": "识别字体或像素补偿依赖，改用 DPI 无关的 SVG 几何布局，并在 100% 与 125% DPI 下完成真实渲染检查。",
      "files": []
    }
  ]
}
```

- [ ] **Step 2: Verify JSON and skill references**

Run:

```powershell
Get-Content -Raw C:\Users\Lancer\.codex\skills\ui-icon-engineering\evals\evals.json | ConvertFrom-Json | Out-Null
rg -n "Unicode|Emoji|SVG|125%|结构" C:\Users\Lancer\.codex\skills\ui-icon-engineering
```

Expected: JSON parses and every approved rule appears in the skill or evaluations.

---

### Task 3: Evaluate and package the skill

**Files:**
- Create: `C:/Users/Lancer/.codex/skills/ui-icon-engineering-workspace/iteration-1/`
- Create: `C:/Users/Lancer/.codex/skills/ui-icon-engineering.skill`

**Interfaces:**
- Consumes: `SKILL.md` and `evals/evals.json` from Tasks 1 and 2.
- Produces: reviewable evaluation results and a packaged installable skill.

- [ ] **Step 1: Run the three prompts with the skill and a baseline**

Execute every prompt once with `C:/Users/Lancer/.codex/skills/ui-icon-engineering/SKILL.md` and once without it. Save results under matching `with_skill/outputs` and `without_skill/outputs` directories.

- [ ] **Step 2: Grade objective requirements**

Check each result for these assertions:

- Reuses an existing SVG/icon component before introducing a new icon source.
- Rejects Unicode/Emoji/font glyphs for formal UI icons.
- Avoids padding or transforms as the primary glyph-alignment fix.
- Includes a structural SVG assertion.
- Includes real rendering checks at 100% and 125% DPI when applicable.

- [ ] **Step 3: Generate the review artifact**

Run the Skill Creator aggregation and viewer scripts against `iteration-1`, producing `benchmark.json`, `benchmark.md`, and a static review HTML file.

- [ ] **Step 4: Package the skill**

Run:

```powershell
python C:\Users\Lancer\.agents\skills\skill-creator\scripts\package_skill.py C:\Users\Lancer\.codex\skills\ui-icon-engineering C:\Users\Lancer\.codex\skills
```

Expected: `C:/Users/Lancer/.codex/skills/ui-icon-engineering.skill` is created and the installed directory remains usable.
