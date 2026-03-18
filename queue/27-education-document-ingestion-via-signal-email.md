# Education document ingestion via Signal/email

**Sphere:** Children
**Backlog item:** Education document ingestion via Signal/email
**Depends on:** Education Advisor Supabase integration, Signal image handling

## What to build

Accept photos of education documents (report cards, assessments) via Signal or forwarded emails and push them through Education Advisor's smart ingestion pipeline into the Supabase document vault with AI-powered metadata extraction.

## Context

Education tools already query Supabase (src/tools/education-*.js, src/utils/supabase.js). Education Advisor's ingestion pipeline uses Gemini Vision API for smart extraction (see ~/education-advisor/src/actions/documents.ts). Signal attachments need to be handled first (see Camera/image understanding card). The Supabase documents table stores content, embedding, tags, subjects, category.

## Implementation notes

Create `src/tools/education-upload.js` that: (1) accepts a child_name and document description, (2) takes the most recent Signal image attachment from the conversation, (3) uploads to Supabase Storage, (4) inserts a row into the documents table with metadata, (5) optionally triggers the smart ingestion pipeline (Gemini Vision extraction). For email forwarding: parse forwarded email body/attachments when the message contains education document context.

## Server requirements

- [ ] Supabase Storage bucket must exist for document uploads
- [ ] Google Gemini API key for smart ingestion (optional for v1)

## Verification

- Send Iji a photo of a report card + "Upload this as Ryker's Q2 report card" → Document appears in Supabase
- Forward an email with assessment results → Iji extracts and uploads
- Ask Iji: "What documents did I just upload?" → Shows recent uploads

## Done when

- [ ] `education_upload` tool accepts Signal images and uploads to Supabase
- [ ] Document metadata (child, category, date) populated
- [ ] Works for both Signal photos and forwarded email content
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Education document ingestion via Signal/email" "In Review"
```

## Commit message

`feat: add education document ingestion via Signal attachments`
