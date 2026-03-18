# Camera/image understanding

**Sphere:** Property & Home
**Backlog item:** Camera/image understanding
**Depends on:** Vision-capable API (Claude or Gemini)

## What to build

Let Iji process images from Signal (doorbell camera, fridge contents, room photos) and provide context-aware responses. Uses Claude's vision capabilities to interpret images sent in conversation.

## Context

Signal attachments include images. The signal broker (src/broker/signal.js) currently only processes text messages. Claude's API supports vision (image content blocks). The key work is extracting image attachments from Signal messages and passing them to the brain as image content.

## Implementation notes

Modify `src/broker/signal.js` to detect image attachments in incoming messages (dataMessage.attachments[]), download the attachment file from signal-cli's storage directory, convert to base64, and include as an image content block in the envelope. Modify `src/brain/index.js` to pass image content blocks through to the Claude API call. No new tool needed — this is a broker/brain enhancement.

## Server requirements

- [ ] Signal-cli must store attachments (default behavior)
- [ ] Sufficient disk space for temporary image storage

## Verification

- Send Iji a photo of a room via Signal → Iji describes what it sees
- Send a photo of a document → Iji reads/summarizes the text
- Send a photo with a text question → Iji answers using both image and text context

## Done when

- [ ] Signal broker extracts image attachments
- [ ] Images passed to Claude API as content blocks
- [ ] Iji responds with image-aware context
- [ ] Non-image messages continue to work unchanged
- [ ] Tests pass
- [ ] Committed and deployed to EC2

## GitHub Project

After completing, run:
```
./scripts/gh-update-card.sh "Camera/image understanding" "In Review"
```

## Commit message

`feat: add image understanding for Signal photo attachments`
