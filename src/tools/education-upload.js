import { query, insert, uploadFile, isConfigured } from '../utils/supabase.js';
import log from '../utils/logger.js';

const STORAGE_BUCKET = process.env.SUPABASE_EDUCATION_BUCKET || 'education-documents';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export const definition = {
  name: 'education_upload',
  description:
    "Upload an education document (report card, assessment, IEP, 504 plan, neuropsych, etc.) to the Education Advisor document vault. Use when the user sends a Signal photo of a document and says to upload it, or when they forward an email with education document content. Extracts metadata automatically when possible.",
  input_schema: {
    type: 'object',
    properties: {
      child_name: {
        type: 'string',
        description: 'The child\'s first name (e.g., "Ryker", "Logan", "Hazel", "AJ", "Alex")',
      },
      description: {
        type: 'string',
        description: 'Document name or description (e.g., "Q2 report card", "DIBELS assessment November 2025")',
      },
      category: {
        type: 'string',
        enum: ['academic_architecture', 'differentiation_opportunity', 'constitution_culture', 'performance_profile', 'operational_basics', 'other'],
        description: 'Document category — will be inferred from doc_type if not provided',
      },
      doc_type: {
        type: 'string',
        description: 'Document type: report_card, assessment, iep, 504_plan, neuropsych, teacher_notes, school_policy, other',
      },
      doc_date: {
        type: 'string',
        description: 'Document date in YYYY-MM-DD format — will be extracted from content when possible',
      },
    },
    required: ['child_name', 'description'],
  },
};

async function extractWithGemini(imageBase64, mediaType, description) {
  if (!GEMINI_API_KEY) return null;

  const prompt = `You are analyzing a photo of a school or education document. The user describes it as: "${description}".

Extract the following metadata and return ONLY a JSON object (no markdown fences, no explanation):
{
  "doc_type": "one of: report_card, assessment, iep, 504_plan, neuropsych, teacher_notes, school_policy, other",
  "extracted_date": "YYYY-MM-DD or null",
  "subjects": ["array of subject areas mentioned"],
  "tags": ["relevant keyword tags"],
  "summary": "2-3 sentence summary of the document content",
  "category": "one of: academic_architecture, differentiation_opportunity, constitution_culture, performance_profile, operational_basics, other"
}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mediaType, data: imageBase64 } },
              { text: prompt },
            ],
          }],
        }),
      }
    );

    if (!res.ok) {
      log.warn('Gemini extraction failed', { status: res.status });
      return null;
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    // Strip markdown code fences if present
    const clean = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    log.warn('Gemini extraction error', { error: err.message });
    return null;
  }
}

function inferDocType(description) {
  const lower = description.toLowerCase();
  if (/report\s*card/.test(lower)) return 'report_card';
  if (/dibels|star\s+reading|caaspp|sbac|assessment|test\s+result/.test(lower)) return 'assessment';
  if (/\biep\b/.test(lower)) return 'iep';
  if (/504/.test(lower)) return '504_plan';
  if (/neuropsych|psychological\s+eval/.test(lower)) return 'neuropsych';
  if (/teacher\s*notes?/.test(lower)) return 'teacher_notes';
  if (/school\s*polic/.test(lower)) return 'school_policy';
  return 'other';
}

function inferCategory(docType) {
  const map = {
    report_card: 'performance_profile',
    assessment: 'performance_profile',
    iep: 'constitution_culture',
    '504_plan': 'constitution_culture',
    neuropsych: 'academic_architecture',
    teacher_notes: 'differentiation_opportunity',
    school_policy: 'operational_basics',
    other: 'other',
  };
  return map[docType] || 'other';
}

/**
 * Detect a forwarded email block in the message body.
 * Returns the extracted text, or null if not found.
 */
function extractEmailContent(message) {
  if (!message) return null;

  const forwardMarkers = [
    /---------- Forwarded message ---------/i,
    /Begin forwarded message:/i,
    /\-{3,}\s*Original Message\s*\-{3,}/i,
    /Forwarded by /i,
  ];

  for (const marker of forwardMarkers) {
    const idx = message.search(marker);
    if (idx !== -1) {
      return message.slice(idx, idx + 8000).trim();
    }
  }

  // Heuristic: message contains From:/Subject:/Date: header block (inline forward)
  if (/^From:\s+.+\nSubject:\s+/m.test(message)) {
    return message.slice(0, 8000).trim();
  }

  return null;
}

export async function execute(input, envelope) {
  if (!isConfigured()) {
    return { error: 'Education Advisor not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env' };
  }

  try {
    const childName = (input.child_name || '').trim();
    const description = (input.description || '').trim();

    // Resolve child
    const children = await query('children', `name=ilike.*${encodeURIComponent(childName)}*&select=id,name`);
    if (!children.length) {
      return { error: `No child found matching "${childName}". Available: Ryker, Logan, Hazel, AJ, Alex.` };
    }
    const child = children[0];

    // Determine source
    const hasSignalImage = Array.isArray(envelope?.images) && envelope.images.length > 0;
    const emailContent = !hasSignalImage ? extractEmailContent(envelope?.message || '') : null;

    if (!hasSignalImage && !emailContent) {
      return {
        error: 'No image or forwarded email content found. Send a photo of the document via Signal, or forward an email containing the document.',
      };
    }

    let fileUrl = null;
    let geminiMetadata = null;
    let documentContent = '';

    if (hasSignalImage) {
      const image = envelope.images[0];

      // Optional: Gemini Vision extraction
      geminiMetadata = await extractWithGemini(image.base64, image.media_type, description);

      // Upload image to Supabase Storage
      const extMap = { 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };
      const ext = extMap[image.media_type] || 'jpg';
      const slug = description.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 40);
      const storagePath = `${child.id}/${Date.now()}-${slug}.${ext}`;

      try {
        const buffer = Buffer.from(image.base64, 'base64');
        fileUrl = await uploadFile(STORAGE_BUCKET, storagePath, buffer, image.media_type);
        log.info('Document image uploaded to Supabase Storage', { path: storagePath, bytes: buffer.length });
      } catch (err) {
        log.warn('Storage upload failed — continuing without file URL', { error: err.message });
      }

      documentContent = geminiMetadata?.summary || `Photo of ${description} for ${child.name}.`;
    } else {
      // Email forwarding path
      documentContent = emailContent;
    }

    // Build metadata — prefer explicit input, then Gemini, then inference
    const docType = input.doc_type || geminiMetadata?.doc_type || inferDocType(description);
    const category = input.category || geminiMetadata?.category || inferCategory(docType);
    const extractedDate = input.doc_date || geminiMetadata?.extracted_date || null;
    const subjects = geminiMetadata?.subjects || [];
    const tags = geminiMetadata?.tags || [docType, child.name.toLowerCase()].filter(Boolean);

    const docRow = {
      name: description,
      content: documentContent,
      category,
      doc_type: docType,
      extracted_date: extractedDate,
      tags,
      subjects,
      child_id: child.id,
      school_id: null,
      ...(fileUrl ? { file_url: fileUrl } : {}),
    };

    const inserted = await insert('documents', docRow);
    const doc = Array.isArray(inserted) ? inserted[0] : inserted;

    log.info('Education document uploaded', { childId: child.id, docType, name: description });

    const notes = [
      geminiMetadata ? 'AI metadata extracted via Gemini.' : null,
      fileUrl ? 'Image stored in Supabase Storage.' : null,
      hasSignalImage ? 'Source: Signal photo.' : 'Source: forwarded email.',
    ].filter(Boolean).join(' ');

    return {
      success: true,
      document: {
        id: doc?.id,
        name: description,
        child: child.name,
        doc_type: docType,
        category,
        date: extractedDate,
        tags,
        subjects,
        has_file: !!fileUrl,
        ai_extracted: !!geminiMetadata,
        source: hasSignalImage ? 'signal_image' : 'email',
      },
      message: `Uploaded "${description}" for ${child.name}. ${notes}`.trim(),
    };
  } catch (err) {
    log.error('education_upload failed', { error: err.message });
    return { error: `Education upload failed: ${err.message}` };
  }
}
