import { db } from "./firebaseClient.js";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { societyName } = req.query;

  if (!societyName) {
      return res.status(400).json({ message: "Society name required" });
  }

  try {
    // Check if society exists in "residencies" collection
    let residencyRef = doc(db, "residencies", societyName);
    let residencySnapshot = await getDoc(residencyRef);

    if (!residencySnapshot.exists()) {
        // Try searching by name if ID lookup fails
        const q = query(collection(db, "residencies"), where("name", "==", societyName));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            residencySnapshot = snapshot.docs[0];
        } else {
             // If not found, default to ON
             return res.status(200).json({ serviceStatus: "ON" });
        }
    }

    const residency = residencySnapshot.data();
    const status = residency.serviceStatus || "ON";

    res.status(200).json({ serviceStatus: status });

  } catch (error) {
    console.error("Residency Status Error:", error);
    // Fail safe to ON
    res.status(200).json({ serviceStatus: "ON" });
  }
}
