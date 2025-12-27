import { db } from "./firebaseClient.js";
import { doc, setDoc, collection, getDocs } from "firebase/firestore";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // Security: This endpoint should be protected or removed in production.
  // For now, we allow it to bootstrap the first owner.
  // Ideally, check for a secret key header.
  
  const { username, password, name, residencies } = req.body;
  
  if (!username || !password) {
      return res.status(400).json({ message: "Missing fields" });
  }

  try {
    // Step 1: Fetch all residencies and add them to the new owner's residencies list
    const residenciesRef = collection(db, "residencies");
    const residenciesSnapshot = await getDocs(residenciesRef);
    const residenciesList = residenciesSnapshot.docs.map(doc => doc.data().name); // Extract the name of each residency

    // Step 2: Create new owner document
    const ownerRef = doc(db, "owners", username);

    await setDoc(ownerRef, {
        username,
        password, // Storing plain text as per prompt requirement
        name: name || username,
        residencies: residenciesList, // Assign all residencies automatically
        createdAt: new Date().toISOString()
    });

    res.status(200).json({ success: true, message: "Owner created and residencies assigned automatically" });
  } catch (error) {
    console.error("Create Owner Error:", error);
    res.status(500).json({ message: "Error creating owner" });
  }
}
