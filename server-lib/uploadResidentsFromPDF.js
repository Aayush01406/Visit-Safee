import admin from "firebase-admin";
import formidable from "formidable";
import fs from "fs";
import bcrypt from "bcryptjs";

// Fix ESM import for pdf-parse
let pdfParse;
try {
  pdfParse = (await import("pdf-parse")).default;
} catch (e) {
  // Fallback for different module systems
  const pdfParseModule = await import("pdf-parse/lib/pdf-parse.js");
  pdfParse = pdfParseModule.default || pdfParseModule;
}

export const config = {
  api: {
    bodyParser: false,
  },
};

// --- Helper for Firebase Init ---
function initAdmin() {
  if (admin.apps.length) return;
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!svc) return;
  try {
    const serviceAccount = JSON.parse(svc);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (e) {
    console.error("Firebase Admin Init Error:", e);
  }
}

export default async function handler(req, res) {
  // 🔥 GUARANTEED JSON RESPONSE HEADER
  res.setHeader("Content-Type", "application/json");

  try {
    if (req.method !== "POST") {
      res.status(405).json({ success: false, message: "Method not allowed" });
      return;
    }

    // 🔥 FIREBASE INIT WRAPPED
    try {
        initAdmin();
        if (!admin.apps.length) {
            throw new Error("Server configuration missing (Firebase)");
        }
    } catch (e) {
        res.status(200).json({ success: false, error: { code: "UPLOAD_ERROR", message: "Firebase initialization failed" } });
        return;
    }

    const db = admin.firestore();

    // 🔥 FORMIDABLE PROMISE WRAPPER
    let data;
    try {
        data = await new Promise((resolve, reject) => {
            const form = formidable({ multiples: false, maxFileSize: 12 * 1024 * 1024 });
            form.parse(req, (err, fields, files) => {
                if (err) reject(err);
                else resolve({ fields, files });
            });
        });
    } catch (formError) {
        res.status(200).json({ success: false, error: { code: "UPLOAD_ERROR", message: "Form parsing failed" } });
        return;
    }

    const file = data.files.file ? (Array.isArray(data.files.file) ? data.files.file[0] : data.files.file) : null;
    if (!file) {
      res.status(200).json({ success: false, error: { code: "INVALID_FILE", message: "PDF file missing" } });
      return;
    }

    // Handle residencyId
    let residencyId = data.fields.residencyId;
    if (Array.isArray(residencyId)) residencyId = residencyId[0];
    if (!residencyId) {
        res.status(200).json({ success: false, error: { code: "UPLOAD_ERROR", message: "Missing residencyId" } });
        return;
    }

    // Validate file mimetype and size
    const isPdfMime = typeof file.mimetype === "string" && file.mimetype.toLowerCase().includes("pdf");
    const isPdfName = typeof file.originalFilename === "string" && file.originalFilename.toLowerCase().endsWith(".pdf");
    if (!isPdfMime && !isPdfName) {
      res.status(200).json({ success: false, error: { code: "INVALID_FILE", message: "Only PDF files are allowed" } });
      return;
    }
    if (typeof file.size === "number" && file.size > 12 * 1024 * 1024) {
      res.status(200).json({ success: false, error: { code: "INVALID_FILE", message: "File too large (max 12MB)" } });
      return;
    }

    // 🔥 PDF PARSING WRAPPED (SERVER-SIDE ONLY)
    let pdfText = "";
    try {
      const buffer = fs.readFileSync(file.filepath);
      const parsed = await pdfParse(buffer);
      pdfText = parsed.text || "";
    } catch (pdfError) {
      res.status(200).json({ 
        success: false,
        error: { code: "PDF_PARSE_ERROR", message: "Failed to parse PDF" }
      });
      return;
    }

    const lines = pdfText
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    let created = 0;
    let skipped = 0;
    const batch = db.batch();
    const warnings = [];

    // Helper to hash password
    const hashPassword = async (pwd) => {
        return await bcrypt.hash(pwd, 10);
    };

    // Process lines (Simple heuristic: Block Flat Phone Name)
    // Adjust regex based on expected PDF format
    // Example: "A 101 9876543210 John Doe"
    for (const line of lines) {
        // Skip headers or short lines
        if (line.length < 5 || line.toLowerCase().includes("block")) continue;

        const parts = line.split(/\s+/);
        if (parts.length < 3) {
            skipped++;
            warnings.push(`Skipped line (insufficient fields): "${line}"`);
            continue;
        }

        // Heuristic: First part is Block, Second is Flat, Third is Phone?
        // OR: Flat Phone Name?
        // Let's assume user provides a standard format or we try to guess.
        // For robustness, let's look for a phone number pattern.
        
        const phoneIndex = parts.findIndex(p => /^\d{10}$/.test(p));
        if (phoneIndex === -1) {
             skipped++; // No valid phone found
             warnings.push(`Skipped line (invalid phone): "${line}"`);
             continue;
        }

        // Assuming: [Block] [Flat] [Phone] [Name...]
        // If phone is at index 2: A 101 9999999999 Name
        // If phone is at index 1: 101 9999999999 Name (Block implied?)
        
        let blockName = "A"; // Default
        let flatNumber = "";
        let phone = parts[phoneIndex];
        let name = parts.slice(phoneIndex + 1).join(" ");

        if (phoneIndex === 2) {
            blockName = parts[0];
            flatNumber = parts[1];
        } else if (phoneIndex === 1) {
            flatNumber = parts[0];
        } else {
            // Unclear format
            skipped++;
            warnings.push(`Skipped line (unrecognized format): "${line}"`);
            continue;
        }

        if (!flatNumber || !phone || !name) {
            skipped++;
            warnings.push(`Skipped line (missing required fields): "${line}"`);
            continue;
        }

        // Validate duplicates (Flat + Phone)
        // Since we are in a batch, we can't easily check Firestore *inside* the transaction for every row efficiently without reading all first.
        // For safety, we use a deterministic ID: residencyId_flat_phone
        
        const userId = `${residencyId}_${flatNumber}_${phone}`;
        const userRef = db.collection("residencies").doc(residencyId).collection("residents").doc(userId);
        
        // We will overwrite or merge. Let's merge to be safe.
        // We also need Auth user. But we can't create Auth user in batch.
        // So we create Firestore doc only here. Auth user creation should ideally happen via a separate process or we accept that bulk upload creates Firestore records first.
        // Wait, the prompt says "create Firebase Auth users".
        // We CANNOT create Auth users in a batch. We have to do it one by one.
        // If we do it one by one, it might timeout for large files.
        // But for < 500 records, it might be okay.
        
        try {
             // Create Auth User
             let userRecord;
             try {
                 userRecord = await admin.auth().getUserByPhoneNumber(`+91${phone}`);
             } catch (e) {
                 if (e.code === 'auth/user-not-found') {
                     userRecord = await admin.auth().createUser({
                         phoneNumber: `+91${phone}`,
                         displayName: name,
                         password: "password123" // Temporary password
                     });
                 } else {
                     throw e; // Other error
                 }
             }

             // Add to Batch
             batch.set(userRef, {
                 uid: userRecord.uid,
                 name,
                 phone,
                 flatNumber,
                 blockName,
                 role: "resident",
                 residencyId,
                 createdAt: admin.firestore.FieldValue.serverTimestamp()
             }, { merge: true });

             created++;
        } catch (err) {
             console.error(`Failed to create user ${phone}:`, err);
             warnings.push(`Failed to create user ${phone}: ${err.message}`);
             skipped++;
        }
    }

    if (created > 0) {
        await batch.commit();
    }

    res.status(200).json({
        success: true,
        residentsCreated: created,
        skippedRows: skipped,
        warnings
    });

  } catch (err) {
    console.error("Critical Upload Error:", err);
    res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Internal Server Error" } });
  }
}
