import { db } from "./firebaseClient.js";
import { doc, getDoc } from "firebase/firestore";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { username, password } = req.body;

  try {
    const ownerRef = doc(db, "owners", username);
    const ownerSnapshot = await getDoc(ownerRef);

    if (!ownerSnapshot.exists()) {
      // Security: Don't reveal if user exists
      return res.status(400).json({ message: "Invalid username or password" });
    }

    const owner = ownerSnapshot.data();
    
    if (owner.password !== password) {
       return res.status(400).json({ message: "Invalid username or password" });
    }

    // Return success
    res.status(200).json({ 
        success: true, 
        redirectUrl: `/owner/dashboard`,
        owner: {
            username: owner.username,
            name: owner.name || owner.username,
            residencies: owner.residencies || []
        }
    });

  } catch (error) {
    console.error("Owner Login Error:", error);
    res.status(500).json({ message: "Error logging in" });
  }
}
