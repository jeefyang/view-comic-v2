## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (`jeefyang/view-comic-v2`), driven by the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five triage roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) plus the five `wayfinder:*` labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` at the repo root plus ADRs in `docs/adr/`. See `docs/agents/domain.md`.

## 项目记忆

改动代码前先读 `docs/project-memory.md`：技术栈与启动方式、目录职责、RPC / 阅读页 / 图片地址三条关键链路，以及必须遵守的约定（路径穿越、`sendStatus(404)`、`basePath` 语义、server 不热重载、7 个既有 tsc 错误）。
