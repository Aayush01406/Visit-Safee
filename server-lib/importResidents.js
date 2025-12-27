import { db } from "./firebaseClient.js";
import { doc, collection, getDocs, writeBatch, serverTimestamp } from "firebase/firestore";
import formidable from "formidable";
import fs from "fs";
import pdfParse from "pdf-parse";
 
function normalizeBlock(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return null;
  const direct = v.match(/^([a-z])$/);
  if (direct) return `Block ${direct[1].toUpperCase()}`;
  const withLabel = v.match(/^(?:block|tower|wing)\s*([a-z])$/i);
  if (withLabel) return `Block ${withLabel[1].toUpperCase()}`;
  return null;
}

// Initialize Firebase Admin (Singleton)
function initAdmin() {
  // Client SDK doesn't need admin initialization
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    // 1. Parse Form Data
    const data = await new Promise((resolve, reject) => {
      const form = formidable({ multiples: false, maxFileSize: 10 * 1024 * 1024 }); // 10MB
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    const file = data.files.file ? (Array.isArray(data.files.file) ? data.files.file[0] : data.files.file) : null;
    const residencyId = Array.isArray(data.fields.residencyId) ? data.fields.residencyId[0] : data.fields.residencyId;

    if (!file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    if (!residencyId) {
      return res.status(400).json({ success: false, message: "Residency ID is required" });
    }

    const mime = String(file.mimetype || "").toLowerCase().trim();
    if (mime && mime !== "application/pdf") {
      return res.status(400).json({ success: false, message: "Invalid file type. Only PDF is allowed." });
    }

    const buffer = fs.readFileSync(file.filepath);
    const header = buffer.slice(0, 4).toString("ascii");
    if (header !== "%PDF") {
      return res.status(400).json({ success: false, message: "File content is not a valid PDF." });
    }

    const pdfData = await pdfParse(buffer);
    const textRaw = pdfData.text || "";
    const text = textRaw.trim();
    if (!text || text.startsWith("<") || /<!DOCTYPE/i.test(text)) {
      return res.status(400).json({ success: false, message: "Invalid PDF content. Could not extract text." });
    }
    
    // Split lines and cleanup
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);

    // 3. Process Residents
    const createdResidents = [];
    const skippedDetails = [];
    const failedDetails = [];
    let createdCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    const residentsRef = collection(db, "residencies", residencyId, "residents");

    // Pre-fetch existing residents to minimize reads/writes
    const existingSnapshot = await getDocs(residentsRef);
    const existingUsernames = new Set();
    
    existingSnapshot.forEach(doc => {
        existingUsernames.add(doc.id);
    });

    let currentBlock = null;
    const operations = []; // Store operations to be batched

    // SMART PARSING LOGIC
    for (const line of lines) {
        // A. Header/Garbage Detection
        if (line.match(/^Page\s+\d/i) || line.length < 3) continue;

        // Sticky Header Check (Standalone Block)
        const headerMatch = line.match(/^(?:Block|Tower|Wing)\s*([A-Z])$/i);
        if (headerMatch) {
            currentBlock = headerMatch[1].toUpperCase();
            continue; // It's a header line
        }

        // B. Pre-process Merged Strings (Intelligent Split)
        // e.g. "A101Aayush" -> "A 101 Aayush"
        // Look for: [Letter] followed immediately by [Digits] followed immediately by [Letter]
        let processedLine = line.replace(/([A-Z])(\d{1,4})([A-Za-z])/g, "$1 $2 $3");
        
        // Also handle "A101" at start of line without name attached
        processedLine = processedLine.replace(/^([A-Z])(\d{1,4})\b/g, "$1 $2");

        // C. Universal Extraction
        // Find Phone first (Anchor) - Relaxed Regex: Look for 10 digits starting with 6-9, anywhere.
        const phoneMatch = processedLine.match(/(?:(?:\+|0{0,2})91[\s\-]?)?([6-9]\d{9})/); 
        
        let rawPhone = "";
        let phoneDigits = "";
        let normalizedPhone = "";
        
        if (phoneMatch) {
            rawPhone = phoneMatch[0];
            phoneDigits = phoneMatch[1];
            normalizedPhone = `+91${phoneDigits}`;
        }

        // Remove phone from line to simplify analysis
        let remainingLine = processedLine;
        if (rawPhone) {
            remainingLine = remainingLine.replace(rawPhone, "").trim();
        }

        // D. Block & Flat Detection
        let block = null;
        let flat = null;

        // 1. Explicit Block keyword (e.g. Block A)
        const explicitBlockMatch = remainingLine.match(/\b(?:Block|Tower|Wing)\s*([A-Z])\b/i);
        if (explicitBlockMatch) {
            block = explicitBlockMatch[1].toUpperCase();
            currentBlock = block; // Update context
            remainingLine = remainingLine.replace(explicitBlockMatch[0], "").trim();
        }

        // 2. Merged BlockFlat (e.g. A101) - Only if block is not yet found
        // Note: The pre-processing step might have already split this, so we look for "A 101" now
        if (!block) {
            // Look for [Letter] [Digits] 
            const splitMatch = remainingLine.match(/\b([A-Z])\s+(\d{1,4})\b/);
            if (splitMatch) {
                block = splitMatch[1].toUpperCase();
                flat = splitMatch[2];
                currentBlock = block;
                remainingLine = remainingLine.replace(splitMatch[0], "").trim();
            }
        }
        
        // 3. Merged (if pre-processing missed it)
        if (!block) {
             const mergedMatch = remainingLine.match(/\b([A-Z])(\d{1,4})\b/);
             if (mergedMatch) {
                 block = mergedMatch[1].toUpperCase();
                 flat = mergedMatch[2];
                 currentBlock = block;
                 remainingLine = remainingLine.replace(mergedMatch[0], "").trim();
             }
        }

        // 4. Use Context if Block still missing
        if (!block && currentBlock) {
            block = currentBlock;
        }

        // 5. Flat Detection (if not found yet)
        if (!flat) {
            // Look for number 1-4 digits, optionally with suffix
            const flatMatch = remainingLine.match(/\b(\d{1,4}[A-Za-z]?)\b/);
            if (flatMatch) {
                flat = flatMatch[1];
                remainingLine = remainingLine.replace(flatMatch[0], "").trim();
            }
        }

        // 6. Infer Block from Flat Prefix (e.g. A-101)
        if (!block && flat) {
            const flatPrefixMatch = flat.match(/^([A-Z])[\-\s]?\d/);
            if (flatPrefixMatch) {
                block = flatPrefixMatch[1].toUpperCase();
                flat = flat.replace(/^([A-Z])[\-\s]?/, ""); // Clean flat
                currentBlock = block;
            }
        }

        // E. Name Extraction
        let name = remainingLine
            .replace(/[|,\-\.]/g, " ") // Remove separators
            .replace(/\s+/g, " ")       // Collapse spaces
            .trim();
        
        // Cleanup name
        name = name.replace(/^(Name|Resident|Mr|Ms|Mrs)\.?\s+/i, "");
        
        // F. Intelligent Inference & Soft Validation
        
        if (!block) {
            const buriedBlock = name.match(/\b([A-Z])\b/);
            if (buriedBlock) {
                block = buriedBlock[1].toUpperCase();
                name = name.replace(buriedBlock[0], "").trim();
            }
        }
        if (!flat) {
            const buriedNumber = name.match(/(\d{1,4}[A-Za-z]?)/);
            if (buriedNumber) {
                 flat = buriedNumber[1];
                 name = name.replace(buriedNumber[1], "").trim();
            }
        }
        if (!block || !flat) {
            skippedDetails.push({ line, reason: "[SKIP] Missing required fields (block/flat)" });
            skippedCount++;
            continue;
        }

        // Inference: Name
        if (!name || name.length < 2) {
            name = `Resident ${flat}`;
        }

        // Soft Validation: Phone
        // If phone missing, generate placeholder (DO NOT SKIP)
        if (!normalizedPhone) {
            // Generate a placeholder phone
            // We use a dummy format that won't conflict with real users easily
            const randomSuffix = Math.floor(100000 + Math.random() * 900000);
            normalizedPhone = `+910000${randomSuffix}`;
        }

        // G. Deduplication
        const username = `${block.toLowerCase()}${flat.toLowerCase()}`;
        
        if (existingUsernames.has(username)) {
            skippedDetails.push({ 
                line, 
                reason: `[SKIP] Block ${block} Flat ${flat} - User already exists` 
            });
            skippedCount++;
            continue;
        }

        // H. Prepare Operation
        // Password: If real phone, use last 6 digits. If placeholder, use '123456'
        const isPlaceholderPhone = normalizedPhone.startsWith("+910000");
        const password = isPlaceholderPhone ? "123456" : normalizedPhone.slice(-6);
        
        const residentData = {
            block: (normalizeBlock(block) || block).trim(),
            flat: String(flat).trim(),
            name: String(name).trim(),
            phone: String(normalizedPhone).trim(),
            username: String(username).trim(),
            password: String(password).trim(),
            role: "resident",
            createdAt: serverTimestamp()
        };

        operations.push({
            type: 'SET',
            ref: doc(db, "residencies", residencyId, "residents", username),
            data: residentData
        });

        existingUsernames.add(username);

        createdResidents.push({
            block,
            flat,
            name,
            phone: normalizedPhone,
            username,
            password,
            loginUrl: "https://visitsafe.vercel.app/login"
        });
        createdCount++;
    }

    // 4. Execute Batch Writes
    const batchSize = 400; // Safe limit
    for (let i = 0; i < operations.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = operations.slice(i, i + batchSize);
        
        chunk.forEach(op => {
            if (op.type === 'SET') {
                batch.set(op.ref, op.data);
            }
        });

        try {
            await batch.commit();
        } catch (err) {
            console.error("Batch Commit Error:", err);
            chunk.forEach(op => {
                 failedDetails.push({ 
                     line: `${op.data.block} ${op.data.flat}`, 
                     reason: `Batch Write Failed: ${err.message}` 
                 });
            });
            failedCount += chunk.length;
            createdCount -= chunk.length;
        }
    }

    return res.status(200).json({
        success: true,
        created: createdCount,
        skipped: skippedCount,
        failed: failedCount,
        residents: createdResidents,
        skippedDetails,
        failedDetails
    });

  } catch (error) {
    console.error("Import Handler Error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
}
