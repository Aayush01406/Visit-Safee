import { db } from "./firebaseClient.js";
import { doc, deleteDoc } from "firebase/firestore";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { residencyId } = req.body;

  if (!residencyId) {
      return res.status(400).json({ message: "Residency ID is required" });
  }

  try {
    const residencyRef = doc(db, "residencies", residencyId);
    await deleteDoc(residencyRef);

    res.status(200).json({ success: true, message: "Residency deleted successfully" });
  } catch (error) {
    console.error("Delete Residency Error:", error);
    res.status(500).json({ message: "Failed to delete residency" });
  }
}
