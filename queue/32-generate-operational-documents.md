# Generate operational documents

**Sphere:** Engine
**Backlog item:** Generate operational documents
**Depends on:** knowledge_search, calendar_query tools

## What to build

Let Iji generate structured documents on demand — packing lists for trips, prep checklists for events, summary reports, or household briefing docs. Output as formatted text or a Google Doc.

## Context

Google Docs integration exists for the weekly family doc sync (scripts/sync-docs-to-gdoc.js). Knowledge and calendar tools provide the data. The work is a tool that Claude uses to assemble context into a formatted document.

## Implementation notes

Create `src/tools/generate-document.js` that takes a document_type (packing_list, event_prep, summary_report, custom) and context parameters, then returns a well-formatted markdown document. For v1, return as message text. Google Docs export can be added in v2.

## Server requirements

- [ ] No new env vars needed for v1 (text output)

## Verification

- Ask Iji: "Generate a packing list for our Tahoe trip this weekend" → Returns structured packing list using knowledge about family members
- Ask Iji: "Write a summary of this week's calendar for the household" → Returns formatted weekly summary
- Ask Iji: "Create a prep checklist for Ryker's birthday party" → Returns event prep checklist

## Done when

- [ ] `generate_document` tool returns formatted documents
- [ ] Multiple document types supported
- [ ] Uses knowledge and calendar context
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Generate operational documents" "In Review"
```

## Commit message

`feat: add operational document generation tool`
