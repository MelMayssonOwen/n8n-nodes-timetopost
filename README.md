# n8n-nodes-timetopost

n8n community node for [TimeToPost](https://timetopost.co/integrations/n8n). Create approval-gated drafts, schedule posts, and list posts and connected accounts from any n8n workflow.

Docs: https://timetopost.co/integrations/n8n . npm: https://www.npmjs.com/package/n8n-nodes-timetopost . CLI: https://github.com/MelMayssonOwen/timetopost-cli

## Install

In n8n open Settings, then Community Nodes, then Install, and enter `n8n-nodes-timetopost`.

## Credentials

Create an API token in TimeToPost and paste it into a new "TimeToPost API" credential.
A draft-only token can create drafts but cannot schedule posts. The credential test calls `GET /api/auth/me`.

## Operations

| Resource | Operation | Endpoint |
| --- | --- | --- |
| Draft | Create | `POST /api/drafts/batch` (always pending approval, never auto-publishes) |
| Post | Schedule | `POST /api/posts` with `scheduledAt` (needs a token with publish permission) |
| Post | Get Many | `GET /api/posts` (status filter and limit applied in the node) |
| Account | Get Many | `GET /api/integrations` (flattened to one item per account) |

Draft is the default path: a human approves drafts in TimeToPost before anything is published.

## Example

`examples/schedule-trigger-to-draft.json` is a Schedule Trigger that creates a draft every morning. Import it from the workflow menu in n8n.

## Development

```
npm install
npm run lint
npm test
npm run build
```

Releases: bump the version in `package.json`, then push a tag `v<version>`. `.github/workflows/publish.yml` publishes to npm with provenance.

MIT licensed.
