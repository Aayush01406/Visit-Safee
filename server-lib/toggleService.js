import { db } from "./firebaseClient.js";
import { doc, updateDoc } from "firebase/firestore";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { residencyId, status } = req.body;

  if (!residencyId || !status) {
      return res.status(400).json({ message: "Missing parameters" });
  }

  if (status !== 'ON' && status !== 'OFF') {
      return res.status(400).json({ message: "Invalid status" });
  }

  try {
    const residencyRef = doc(db, "residencies", residencyId);
    await updateDoc(residencyRef, { serviceStatus: status });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Toggle Service Error:", error);
    res.status(500).json({ message: "Failed to toggle service" });
  }
}
