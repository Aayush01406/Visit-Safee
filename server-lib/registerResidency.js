
import fetch from "node-fetch";

// Helper to format JSON for Firestore REST API
const toFirestoreValue = (value) => {
  if (value === null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (Number.isInteger(value)) return { integerValue: value };
    return { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === "object") {
    const fields = {};
    for (const k in value) {
      fields[k] = toFirestoreValue(value[k]);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { 
    residencyName, 
    adminUsername, 
    adminPassword, 
    adminPhone,
    ownerId = "jaydeep" 
  } = req.body;

  if (!residencyName || !adminUsername || !adminPassword) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || "visitsafe-3b609";
  const API_KEY = process.env.VITE_FIREBASE_API_KEY;
  const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

  try {
    // 1. Check if Residency exists
    const checkResResponse = await fetch(`${BASE_URL}/residencies/${residencyName}?key=${API_KEY}`);
    if (checkResResponse.status === 200) {
       return res.status(409).json({ message: "Residency already exists" });
    }

    // 2. Create Residency
    const residencyData = {
      name: residencyName,
      adminUsername,
      adminPassword,
      adminPhone: adminPhone || null,
      createdAt: new Date().toISOString(),
      serviceStatus: "ON",
      ownerId: ownerId
    };

    const createResResponse = await fetch(`${BASE_URL}/residencies?documentId=${residencyName}&key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: {
          name: toFirestoreValue(residencyData.name),
          adminUsername: toFirestoreValue(residencyData.adminUsername),
          adminPassword: toFirestoreValue(residencyData.adminPassword),
          adminPhone: toFirestoreValue(residencyData.adminPhone),
          createdAt: toFirestoreValue(residencyData.createdAt),
          serviceStatus: toFirestoreValue(residencyData.serviceStatus),
          ownerId: toFirestoreValue(residencyData.ownerId)
      }})
    });

    if (!createResResponse.ok) {
        const errText = await createResResponse.text();
        throw new Error(`Failed to create residency: ${createResResponse.status} ${errText}`);
    }

    // 3. Update Owner (using commit for arrayUnion logic equivalent)
    // We will try to append to 'residencies' array.
    
    // Construct the commit payload for transform (appendMissingElements)
    const ownerPath = `projects/${PROJECT_ID}/databases/(default)/documents/owners/${ownerId}`;
    
    const commitPayload = {
      writes: [
        {
          update: {
            name: ownerPath,
            fields: {
                // Ensure other fields exist if we are creating
                username: toFirestoreValue(ownerId),
                createdAt: toFirestoreValue(new Date().toISOString()) // Only used if creating new
            }
          },
          // updateMask is tricky if we don't know if it exists.
          // Instead, let's just use transform which works on existing or creates new if combined with update?
          // Actually, 'update' operation replaces the document if it exists, or creates.
          // We want 'update' with 'updateMask' OR 'transform'.
          
          // Let's keep it simple: Use 'transform' to add to array. 
          // If document doesn't exist, transform might fail or create empty? 
          // 'transform' writes are allowed on non-existent documents, creating them.
          
          transform: {
            document: ownerPath,
            fieldTransforms: [
              {
                fieldPath: "residencies",
                appendMissingElements: { values: [toFirestoreValue(residencyName)] }
              }
            ]
          }
        }
      ]
    };

    // If we want to ensure 'username' and 'createdAt' are set if it's NEW, but not overwrite if existing:
    // This is hard in one go without complex preconditions.
    // Let's do a GET first.
    
    let ownerExists = false;
    const checkOwner = await fetch(`${BASE_URL}/owners/${ownerId}?key=${API_KEY}`);
    if (checkOwner.status === 200) {
        ownerExists = true;
    }

    if (ownerExists) {
        // Just append
        await fetch(`${BASE_URL}:commit?key=${API_KEY}`, {
            method: 'POST',
            body: JSON.stringify({
                writes: [{
                    transform: {
                        document: ownerPath,
                        fieldTransforms: [{
                            fieldPath: "residencies",
                            appendMissingElements: { values: [toFirestoreValue(residencyName)] }
                        }]
                    }
                }]
            })
        });
    } else {
        // Create with initial array
        await fetch(`${BASE_URL}/owners?documentId=${ownerId}&key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fields: {
                    username: toFirestoreValue(ownerId),
                    createdAt: toFirestoreValue(new Date().toISOString()),
                    residencies: toFirestoreValue([residencyName])
                }
            })
        });
    }

    return res.status(200).json({ 
        success: true, 
        message: "Residency registered and assigned to owner.",
        data: {
            id: residencyName,
            name: residencyName,
            adminUsername,
            createdAt: residencyData.createdAt
        }
    });

  } catch (error) {
    console.error("Register Residency Error:", error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
}
