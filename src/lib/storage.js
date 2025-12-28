import { 
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, 
  query, where, orderBy, onSnapshot, deleteDoc, limit, serverTimestamp, writeBatch
} from "firebase/firestore";
import { db } from "./firebase";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import bcrypt from "bcryptjs";
import { normalizeBlock } from "./utils";

const getEmail = (username, residencyId) => {
  return `${username.toLowerCase().replace(/[^a-z0-9]/g, '')}.${residencyId}@visitsafe.local`;
};

class StorageService {
  
  // === RESIDENCY MANAGEMENT ===

  async getResidencies() {
    const q = query(collection(db, "residencies"), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async registerResidency(data) {
    // Use the API to ensure secure owner update (mimicking Cloud Function trigger)
    const response = await fetch('/api/registerResidency', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const text = await response.text();
        let errorData;
        try {
            errorData = JSON.parse(text);
        } catch {
            console.error("Register Residency Error (Raw):", text);
            throw new Error("Failed to register residency (Server Error)");
        }
        throw new Error(errorData.message || "Failed to register residency");
    }

    const text = await response.text();
    let result;
    try {
        result = JSON.parse(text);
    } catch (e) {
        console.error("Register Residency Success Parse Error:", text);
        throw new Error("Invalid server response");
    }
    return result.data;
  }

  // === AUTH ===

  async login(credentials) {
    const { username, password, residencyId } = credentials;

    // 1. Check Residency (Admin)
    const residencyRef = doc(db, "residencies", residencyId);
    const residencySnap = await getDoc(residencyRef);

    if (!residencySnap.exists()) {
      throw new Error("Residency not found");
    }

    const residencyData = residencySnap.data();
    const residencyName = residencyData.name;

    // Check Admin Credentials
    if (username === residencyData.adminUsername) {
      if (residencyData.adminPassword !== password) {
        throw new Error("Invalid credentials");
      }

      const adminUser = {
        id: "admin", 
        username: residencyData.adminUsername,
        role: "admin",
        name: "Admin", 
        phone: residencyData.adminPhone || null,
        active: true,
        residencyId: residencyId,
        residencyName: residencyName
      };
      this.saveSession(adminUser);
      return adminUser;
    }

    // 2. Check Residents
    const residentRef = doc(db, "residencies", residencyId, "residents", username);
    const residentSnap = await getDoc(residentRef);

    if (residentSnap.exists()) {
       const userData = residentSnap.data(); 
       
       let isValid = userData.password === password;
       if (!isValid) {
          try {
             isValid = await bcrypt.compare(password, userData.password);
          } catch (e) {
             isValid = false;
          }
       }

       if (!isValid) {
         throw new Error("Invalid credentials");
       }

       if (userData.active === false) {
         throw new Error("Account disabled");
       }

       let flatNumber = null;
       if (userData.flatId) {
          const flatRef = doc(db, "residencies", residencyId, "flats", userData.flatId);
          const flatSnap = await getDoc(flatRef);
          if (flatSnap.exists()) {
             flatNumber = flatSnap.data().number;
          }
       }

       const user = { id: residentSnap.id, ...userData, residencyId, residencyName, role: "resident", flatNumber };
       delete user.password;
       
       this.saveSession(user);
       return user;
    }

    // 3. Check Guards
    const guardRef = doc(db, "residencies", residencyId, "guards", username);
    const guardSnap = await getDoc(guardRef);

    if (guardSnap.exists()) {
       const userData = guardSnap.data();

       if (userData.password !== password) {
         throw new Error("Invalid credentials");
       }

       if (userData.active === false) {
         throw new Error("Account disabled");
       }
       const user = { id: guardSnap.id, ...userData, residencyId, residencyName, role: "guard" };
       delete user.password;

       this.saveSession(user);
       return user;
    }

    throw new Error("Invalid credentials or user not found");
  }

  saveSession(user) {
    localStorage.setItem("society_user_session", JSON.stringify({
      username: user.username,
      residencyId: user.residencyId,
      residencyName: user.residencyName,
      role: user.role,
      flatNumber: user.flatNumber,
      loggedIn: true
    }));
    if (user.residencyName) {
      localStorage.setItem("residencyName", user.residencyName);
    }

    // Request persistent storage to prevent browser eviction
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(granted => {
        if (granted) {
          console.log("Storage will not be cleared except by explicit user action");
        } else {
          console.log("Storage may be cleared by the UA under storage pressure.");
        }
      }).catch(err => console.error("Persistence check failed", err));
    }
  }

  async logout() {
    // Only clear session on explicit logout
    localStorage.removeItem("society_user_session");
    localStorage.removeItem("residencyName");
    try {
      await signOut(auth);
    } catch (error) {
      console.warn("Firebase signout error (harmless if already signed out):", error);
    }
  }

  async getCurrentUser() {
    const sessionStr = localStorage.getItem("society_user_session");
    if (!sessionStr) return null;

    try {
      const session = JSON.parse(sessionStr);
      if (!session.username || !session.residencyId) return null;

      // Verify user existence in background but return session immediately for speed
      // If user is deleted/disabled, it will fail on next action or we can add a swr revalidation
      
      const residencyRef = doc(db, "residencies", session.residencyId);
      // We check if we can get the doc, but we don't strictly block returning the session
      // to support offline/flaky internet usage ("remember me").
      // Ideally, we should do a background check.
      
      // For now, let's keep the verification but make it robust against network errors?
      // No, the user asked to "remember that person".
      // So we should trust localStorage first, then verify.
      
      // Let's do a quick verification but NOT logout automatically on network error.
      // Only logout if we are SURE the user is invalid (e.g., account deleted).
      
      try {
        const residencySnap = await getDoc(residencyRef);
        if (!residencySnap.exists()) {
           // Residency deleted - valid reason to logout
           await this.logout();
           return null;
        }

        const residencyData = residencySnap.data();
        
        if (session.role === 'admin') {
           if (residencyData.adminUsername !== session.username) {
             // Admin credentials changed - valid reason to logout
             await this.logout();
             return null;
           }
           // Update session with latest data if needed
           return {
              ...session,
              name: "Admin",
              phone: residencyData.adminPhone || null,
              active: true
           };
        }

        const collectionName = session.role === 'guard' ? 'guards' : 'residents';
        const userDoc = await getDoc(doc(db, "residencies", session.residencyId, collectionName, session.username));

        if (!userDoc.exists()) {
           // User deleted
           await this.logout();
           return null;
        }
        
        const userData = userDoc.data();
        if (userData.active === false) {
           // User banned/disabled
           await this.logout();
           return null;
        }
        
        let flatNumber = session.flatNumber;
        if (session.role === 'resident' && !flatNumber && userData.flatId) {
             const flatRef = doc(db, "residencies", session.residencyId, "flats", userData.flatId);
             const flatSnap = await getDoc(flatRef);
             if (flatSnap.exists()) {
                flatNumber = flatSnap.data().number;
             }
        }

        return { ...session, ...userData, id: userDoc.id, flatNumber };

      } catch (networkError) {
        console.warn("Network error verifying session, trusting localStorage:", networkError);
        // If offline, return the session from localStorage so the user stays logged in
        return session;
      }

    } catch (e) {
      console.error("Error parsing session:", e);
      return null;
    }
  }

  // === REAL-TIME HELPERS ===
  
  async getVisitorRequests(filter) {
    const dbUser = await this.getCurrentUser();
    if (!dbUser) return [];

    let q = query(
      collection(db, "residencies", dbUser.residencyId, "visitor_requests"), 
      orderBy("createdAt", "desc")
    );
    
    if (filter?.status) {
      q = query(q, where("status", "==", filter.status));
    }

    const snapshot = await getDocs(q);
    let requests = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // Load metadata for resolving relations
    const blocks = await this.getBlocks(dbUser.residencyId);
    const flatsSnapshot = await getDocs(collection(db, "residencies", dbUser.residencyId, "flats"));
    const flats = flatsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // Resolve details
    const detailedRequests = requests.map(req => {
        const flat = flats.find(f => f.id === req.flatId);
        if (!flat) return null;
        const block = blocks.find(b => b.id === flat.blockId);
        if (!block) return null;
        
        return {
        ...req,
        flat: { ...flat, block }
        };
    }).filter(Boolean);

    // Filter for Resident
    if (dbUser.role === "resident") {
        const residentDoc = await getDoc(doc(db, "residencies", dbUser.residencyId, "residents", dbUser.username));
        if (residentDoc.exists()) {
            const residentData = residentDoc.data();
            
            return detailedRequests.filter(req => {
                // 1. Match by Flat ID (Standard)
                if (req.flatId && residentData.flatId && req.flatId === residentData.flatId) {
                    return true;
                }

                // 2. Match by Block & Flat Name (Fallback for PDF Imports)
                let reqBlock = req.flat?.block?.name?.toUpperCase();
                const reqFlat = req.flat?.number?.toUpperCase();
                let resBlock = residentData.block?.toUpperCase();
                const resFlat = residentData.flat?.toUpperCase();

                // Normalize Block Name (Remove "BLOCK", "TOWER", etc.)
                if (reqBlock) reqBlock = reqBlock.replace(/^(BLOCK|TOWER|WING)\s+/, "").trim();
                if (resBlock) resBlock = resBlock.replace(/^(BLOCK|TOWER|WING)\s+/, "").trim();

                if (reqBlock && reqFlat && resBlock && resFlat) {
                    return reqBlock === resBlock && reqFlat === resFlat;
                }

                return false;
            });
        }
    }

    return detailedRequests;
  }

  async getAllVisitorRequestsWithDetails() {
    return this.getVisitorRequests();
  }

  async getStats() {
    const user = await this.getCurrentUser();
    if (!user) return { totalVisitors: 0, pendingRequests: 0, activeVisitors: 0 };

    const q = query(collection(db, "residencies", user.residencyId, "visitor_requests"));
    const snapshot = await getDocs(q);
    const requests = snapshot.docs.map(d => d.data());

    return {
      totalVisitors: requests.length,
      pendingRequests: requests.filter(r => r.status === 'pending').length,
      activeVisitors: requests.filter(r => r.status === 'entered').length
    };
  }

  async createPublicVisitorRequest(data, residencyId, residencyName) {
    if (!residencyId) throw new Error("Residency ID is required");
    
    // Generate approval token
    const approvalToken = crypto.randomUUID();
    
    const docData = {
      ...data,
      status: 'pending',
      approvalToken: approvalToken,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, "residencies", residencyId, "visitor_requests"), docData);
    const visitorId = docRef.id;
    
    // Get flat and block details for notification
    let flatDetails = null;
    let blockDetails = null;
    
    try {
      const flatDoc = await getDoc(doc(db, "residencies", residencyId, "flats", data.flatId));
      if (flatDoc.exists()) {
        flatDetails = flatDoc.data();
        if (flatDetails.blockId) {
          const blockDoc = await getDoc(doc(db, "residencies", residencyId, "blocks", flatDetails.blockId));
          if (blockDoc.exists()) {
            blockDetails = blockDoc.data();
          }
        }
      }
    } catch (error) {
      console.error('Error fetching flat/block details:', error);
    }
    
    // Send notification with approval URLs
    try {
      const baseUrl = window.location.origin;
      // Point to API directly for background handling
      const approveUrl = `${baseUrl}/api/visitor-action?action=approve&residencyId=${residencyId}&requestId=${visitorId}`;
      const rejectUrl = `${baseUrl}/api/visitor-action?action=reject&residencyId=${residencyId}&requestId=${visitorId}`;
      
      const response = await fetch('/api/sendNotification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          residencyId,
          title: 'New Visitor Request',
          body: `${data.visitorName} wants to visit ${blockDetails?.name || 'Block'} ${flatDetails?.number || 'Flat'}`,
          targetType: 'specific_flat',
          targetId: data.flatId,
          data: {
            visitorId: visitorId,
            actionType: 'VISITOR_REQUEST',
            requestId: visitorId, // Add requestId for consistency
            residencyId: residencyId,
            approvalToken: approvalToken,
            approveUrl: approveUrl,
            rejectUrl: rejectUrl,
            click_action: "/", // Redirect to root on click
            visitorName: data.visitorName,
            blockName: blockDetails?.name || 'Unknown',
            flatNumber: flatDetails?.number || 'Unknown',
            purpose: data.purpose || 'Visit'
          },
          webpush: {
            fcmOptions: {
                link: "/"
            }
          }
        })
      });
      
      if (!response.ok) {
        console.error('Notification failed:', await response.text());
      }
    } catch (e) {
      console.error("Error sending notification:", e);
    }

    return visitorId;
  }

  async createVisitorRequest(data) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error("Not authenticated");
    
    return this.createPublicVisitorRequest(data, user.residencyId);
  }

  async updateVisitorRequestStatus(id, status) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error("Not authenticated");

    const response = await fetch('/api/update-request-status', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            residencyId: user.residencyId,
            requestId: id,
            status: status,
            username: user.username
        }),
    });

    if (!response.ok) {
        throw new Error("Failed to update status");
    }

    return id;
  }

  subscribeToVisitorRequest(id, callback, residencyId) {
    let snapshotUnsubscribe = null;

    const setupSubscription = async () => {
        let targetResidencyId = residencyId;
        if (!targetResidencyId) {
             const user = await this.getCurrentUser();
             if (user) targetResidencyId = user.residencyId;
        }

        if (!targetResidencyId) {
            console.error("No residency ID provided for visitor subscription");
            callback(null);
            return;
        }

        const docRef = doc(db, "residencies", targetResidencyId, "visitor_requests", id);
        
        snapshotUnsubscribe = onSnapshot(docRef, async (docSnap) => {
            if (!docSnap.exists()) {
                callback(null);
                return;
            }

            const req = { id: docSnap.id, ...docSnap.data() };
            
            const flatsSnapshot = await getDocs(collection(db, "residencies", targetResidencyId, "flats"));
            const flats = flatsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const blocks = await this.getBlocks(targetResidencyId);

            const flat = flats.find(f => f.id === req.flatId);
            let detailedReq = null;

            if (flat) {
                const block = blocks.find(b => b.id === flat.blockId);
                if (block) {
                    detailedReq = {
                        ...req,
                        flat: { ...flat, block }
                    };
                }
            }
            
            callback(detailedReq || req);
        });
    };

    setupSubscription();

    return () => {
        if (snapshotUnsubscribe) snapshotUnsubscribe();
    };
  }

  subscribeToVisitorRequests(callback, filter) {
    let snapshotUnsubscribe = null;
    let isSubscribed = true; // Prevent race conditions
    const logPrefix = "[LiveListener]";

    console.log(`${logPrefix} Initializing subscription...`);

    this.getCurrentUser().then(async (dbUser) => {
      if (!isSubscribed) {
          console.log(`${logPrefix} Subscribed cancelled before user load.`);
          return;
      }

      if (!dbUser) {
        console.warn(`${logPrefix} No user found, returning empty.`);
        callback([]);
        return;
      }

      console.log(`${logPrefix} User identified:`, dbUser.username, dbUser.role);

      // Pre-fetch Resident Data if needed (to avoid async inside snapshot)
      let residentData = null;
      if (dbUser.role === "resident") {
          try {
             const residentDoc = await getDoc(doc(db, "residencies", dbUser.residencyId, "residents", dbUser.username));
             if (residentDoc.exists()) {
                 residentData = residentDoc.data();
                 console.log(`${logPrefix} Resident profile loaded:`, residentData.block, residentData.flat);
             } else {
                 console.error(`${logPrefix} Resident profile NOT found in Firestore!`);
             }
          } catch (e) {
             console.error(`${logPrefix} Error fetching resident profile:`, e);
          }
      }

      if (!isSubscribed) return;

      let q = query(
        collection(db, "residencies", dbUser.residencyId, "visitor_requests"), 
        orderBy("createdAt", "desc")
      );
      
      if (filter?.status) {
        q = query(q, where("status", "==", filter.status));
      }

      console.log(`${logPrefix} Connecting to Firestore...`);

      snapshotUnsubscribe = onSnapshot(q, async (snapshot) => {
        if (!isSubscribed) return;

        console.log(`${logPrefix} Snapshot received! Docs: ${snapshot.docs.length}`);
        
        let requests = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        // Load metadata for resolving relations
        const blocks = await this.getBlocks(dbUser.residencyId);
        const flatsSnapshot = await getDocs(collection(db, "residencies", dbUser.residencyId, "flats"));
        const flats = flatsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        if (!isSubscribed) return;

        // Resolve details & Filter
        const detailedRequests = requests.map(req => {
          const flat = flats.find(f => f.id === req.flatId);
          if (!flat) return null; // Orphaned request
          const block = blocks.find(b => b.id === flat.blockId);
          if (!block) return null;
          
          return {
            ...req,
            flat: { ...flat, block }
          };
        }).filter(Boolean);

        let finalRequests = detailedRequests;

        if (dbUser.role === "resident" && residentData) {
           finalRequests = detailedRequests.filter(req => {
               // 1. Match by Flat ID (if available on both)
               if (req.flatId && residentData.flatId && req.flatId === residentData.flatId) {
                   return true;
               }

               // 2. Match by Block & Flat Name (Fallback for PDF Imports)
               let reqBlock = req.flat?.block?.name?.toUpperCase();
               const reqFlat = req.flat?.number?.toUpperCase();
               let resBlock = residentData.block?.toUpperCase();
               const resFlat = residentData.flat?.toUpperCase();

               // Normalize Block Name (Remove "BLOCK", "TOWER", etc.)
               if (reqBlock) reqBlock = reqBlock.replace(/^(BLOCK|TOWER|WING)\s+/, "").trim();
               if (resBlock) resBlock = resBlock.replace(/^(BLOCK|TOWER|WING)\s+/, "").trim();

               if (reqBlock && reqFlat && resBlock && resFlat) {
                   return reqBlock === resBlock && reqFlat === resFlat;
               }

               return false;
           });
        }

        console.log(`${logPrefix} Filtered requests for user: ${finalRequests.length}`);
        callback(finalRequests);
      }, (error) => {
          console.error(`${logPrefix} Firestore Listener Error:`, error);
      });
    });

    return () => {
      console.log(`${logPrefix} Unsubscribing...`);
      isSubscribed = false;
      if (snapshotUnsubscribe) snapshotUnsubscribe();
    };
  }

  subscribeToUsers(callback) {
    let isSubscribed = true;
    let unsubRes;
    let unsubGuards;

    this.getCurrentUser().then(async (currentUser) => {
        if (!isSubscribed) return;
        if (!currentUser || currentUser.role !== 'admin') {
            callback([]);
            return;
        }

        const residentsQ = query(collection(db, "residencies", currentUser.residencyId, "residents"));
        const guardsQ = query(collection(db, "residencies", currentUser.residencyId, "guards"));
        
        let residents = [];
        let guards = [];
        
        const residencyDoc = await getDoc(doc(db, "residencies", currentUser.residencyId));
        let adminUser = null;
        if (residencyDoc.exists()) {
            const d = residencyDoc.data();
            adminUser = {
                id: "admin",
                username: d.adminUsername,
                role: "admin",
                name: "Admin",
                phone: d.adminPhone,
                active: true,
                residencyId: currentUser.residencyId
            };
        }

        const updateCallback = async () => {
             if (!isSubscribed) return;
             
             const allUsers = [...residents, ...guards];
             if (adminUser) allUsers.unshift(adminUser);

             const blocks = await this.getBlocks();
             const flatsSnapshot = await getDocs(collection(db, "residencies", currentUser.residencyId, "flats"));
             const flats = flatsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

             const detailedUsers = allUsers.map(user => {
                let flatDetails;
                
                if (user.role === "resident") {
                    // 1. Try relational lookup (flatId)
                    if (user.flatId) {
                        const flat = flats.find(f => f.id === user.flatId);
                        if (flat) {
                            const block = blocks.find(b => b.id === flat.blockId);
                            if (block) flatDetails = { ...flat, block };
                        }
                    }

                    // 2. Fallback to direct fields (PDF Import)
                    if (!flatDetails && user.block && user.flat) {
                        flatDetails = {
                            number: user.flat,
                            block: { name: normalizeBlock(user.block) || user.block }
                        };
                    }
                }
                
                return { ...user, flat: flatDetails };
             });
             
             callback(detailedUsers);
        };

        unsubRes = onSnapshot(residentsQ, (resSnap) => {
             residents = resSnap.docs.map(d => ({ id: d.id, ...d.data(), role: 'resident' }));
             updateCallback();
        });

        unsubGuards = onSnapshot(guardsQ, (guardsSnap) => {
             guards = guardsSnap.docs.map(d => ({ id: d.id, ...d.data(), role: 'guard' }));
             updateCallback();
        });
    });

    return () => {
        isSubscribed = false;
        if (unsubRes) unsubRes();
        if (unsubGuards) unsubGuards();
    };
  }

  // === BLOCKS & FLATS ===

  async getResidencyByName(name) {
    const q = query(collection(db, "residencies"), where("name", "==", name));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  async getBlocks(residencyId) {
    let targetResidencyId = residencyId;
    if (!targetResidencyId) {
      const user = await this.getCurrentUser();
      if (!user) return [];
      targetResidencyId = user.residencyId;
    }
    
    const q = query(collection(db, "residencies", targetResidencyId, "blocks"), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async getFlatsByBlock(blockId, residencyId) {
    let targetResidencyId = residencyId;
    if (!targetResidencyId) {
      const user = await this.getCurrentUser();
      if (!user) return [];
      targetResidencyId = user.residencyId;
    }

    const q = query(collection(db, "residencies", targetResidencyId, "flats"), where("blockId", "==", blockId));
    const snapshot = await getDocs(q);
    const flats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return flats.sort((a, b) => a.number.localeCompare(b.number));
  }

  async createBlock(name) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error("Not authenticated");

    const docRef = await addDoc(collection(db, "residencies", user.residencyId, "blocks"), { name });
    return { id: docRef.id, name };
  }

  async createBlocks(count) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error("Not authenticated");
    const n = parseInt(count, 10);
    if (isNaN(n) || n < 1) throw new Error("Invalid block count");
    
    const existing = await this.getBlocks(user.residencyId);
    const existingNames = new Set(existing.map(b => b.name));
    
    // Find the highest existing letter index
    let maxIndex = -1;
    for (const name of existingNames) {
      if (name.startsWith("Block ")) {
        const letter = name.replace("Block ", "");
        if (letter.length === 1) {
          const code = letter.charCodeAt(0) - 65; // A=0, B=1...
          if (code >= 0 && code < 26 && code > maxIndex) {
            maxIndex = code;
          }
        }
      }
    }

    const namesToCreate = [];
    let currentIndex = maxIndex + 1;
    
    for (let i = 0; i < n; i++) {
      if (currentIndex >= 26) break; // Limit to Z
      const name = `Block ${String.fromCharCode(65 + currentIndex)}`;
      if (!existingNames.has(name)) {
        namesToCreate.push(name);
      } else {
        // Should not happen if logic is correct, but safe guard
        i--; 
      }
      currentIndex++;
    }

    if (namesToCreate.length === 0) return [];
    
    const batch = writeBatch(db);
    const results = [];
    for (const name of namesToCreate) {
      const ref = doc(collection(db, "residencies", user.residencyId, "blocks"));
      batch.set(ref, { name });
      results.push({ id: ref.id, name });
    }
    await batch.commit();
    return results;
  }

  async createFlatsBulk(blockId, floors, flatsPerFloor) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error("Not authenticated");
    
    const numFloors = parseInt(floors, 10);
    const numFlats = parseInt(flatsPerFloor, 10);
    
    if (isNaN(numFloors) || numFloors < 1) throw new Error("Invalid floors count");
    if (isNaN(numFlats) || numFlats < 1) throw new Error("Invalid flats per floor count");

    // Get target blocks
    let targetBlocks = [];
    if (blockId === "all") {
       targetBlocks = await this.getBlocks(user.residencyId);
    } else {
       // Validate block exists or just use ID
       targetBlocks = [{ id: blockId }]; 
    }
    
    if (targetBlocks.length === 0) return [];

    let batch = writeBatch(db);
    let operationCount = 0;
    const maxBatchSize = 450; 
    
    // Get all existing flats to avoid duplicates
    const allFlatsSnap = await getDocs(collection(db, "residencies", user.residencyId, "flats"));
    const existingFlats = new Set(allFlatsSnap.docs.map(d => `${d.data().blockId}-${d.data().number}`));

    for (const block of targetBlocks) {
       for (let f = 1; f <= numFloors; f++) {
          for (let i = 1; i <= numFlats; i++) {
             const flatNumber = `${f}${i.toString().padStart(2, '0')}`;
             
             const key = `${block.id}-${flatNumber}`;
             if (existingFlats.has(key)) continue;

             const ref = doc(collection(db, "residencies", user.residencyId, "flats"));
             batch.set(ref, {
               number: flatNumber,
               blockId: block.id,
               floor: f
             });
             
             operationCount++;
             if (operationCount % maxBatchSize === 0) {
                await batch.commit();
                batch = writeBatch(db); // Create new batch
             }
          }
       }
    }
    
    if (operationCount % maxBatchSize !== 0) {
      await batch.commit();
    }
    return { count: operationCount };
  }


  async createFlat(number, blockId, floor) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error("Not authenticated");

    const docRef = await addDoc(collection(db, "residencies", user.residencyId, "flats"), { number, blockId, floor });
    return { id: docRef.id, number, blockId, floor };
  }

  // === USERS (Admin Actions) ===

  async updateUser(originalUsername, role, data) {
    const currentUser = await this.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') throw new Error("Unauthorized");

    const residencyId = currentUser.residencyId;

    if (role === 'admin') {
      // Update Admin
      const updates = { updatedAt: serverTimestamp() };
      if (data.username) updates.adminUsername = data.username;
      if (data.password) updates.adminPassword = data.password;
      if (data.phone) updates.adminPhone = data.phone;
      
      await updateDoc(doc(db, "residencies", residencyId), updates);
      return;
    }

    const collectionName = role === 'guard' ? 'guards' : 'residents';
    const oldDocRef = doc(db, "residencies", residencyId, collectionName, originalUsername);

    if (data.username && data.username !== originalUsername) {
       // Rename User (Transactional)
       const newDocRef = doc(db, "residencies", residencyId, collectionName, data.username);
       const newDocSnap = await getDoc(newDocRef);
       if (newDocSnap.exists()) throw new Error("Username already taken");
       
       const oldDocSnap = await getDoc(oldDocRef);
       if (!oldDocSnap.exists()) throw new Error("User not found");
       const oldData = oldDocSnap.data();
       
       const newData = {
         ...oldData,
         username: data.username,
         updatedAt: serverTimestamp()
       };
       if (data.password) newData.password = data.password;
       if (data.phone !== undefined) newData.phone = data.phone;
      if (role === 'resident') {
         if (data.flatId) newData.flatId = data.flatId;
         const nb = data.block ? normalizeBlock(data.block) : null;
         if (data.block && !nb) throw new Error("Invalid block value");
         if (nb) newData.block = nb;
         if (data.flat) newData.flat = String(data.flat);
      }
       
       const batch = writeBatch(db);
       batch.set(newDocRef, newData);
       batch.delete(oldDocRef);
       await batch.commit();
       
    } else {
       // Update existing
       const updates = { updatedAt: serverTimestamp() };
       if (data.password) updates.password = data.password;
       if (data.phone !== undefined) updates.phone = data.phone;
      if (role === 'resident') {
         if (data.flatId) updates.flatId = data.flatId;
         const nb = data.block ? normalizeBlock(data.block) : null;
         if (data.block && !nb) throw new Error("Invalid block value");
         if (nb) updates.block = nb;
         if (data.flat) updates.flat = String(data.flat);
      }
       
       await updateDoc(oldDocRef, updates);
    }
  }

  async deleteUser(username, role) {
      const currentUser = await this.getCurrentUser();
      if (!currentUser || currentUser.role !== 'admin') throw new Error("Unauthorized");
      
      if (role === 'admin') throw new Error("Cannot delete admin account");
      
      const collectionName = role === 'guard' ? 'guards' : 'residents';
      await deleteDoc(doc(db, "residencies", currentUser.residencyId, collectionName, username));
  }

  async getAllUsersWithDetails() {
    const user = await this.getCurrentUser();
    if (!user || user.role !== 'admin') return [];

    const residentsSnapshot = await getDocs(collection(db, "residencies", user.residencyId, "residents"));
    const residents = residentsSnapshot.docs.map(d => ({ id: d.id, ...d.data(), role: 'resident' }));

    const guardsSnapshot = await getDocs(collection(db, "residencies", user.residencyId, "guards"));
    const guards = guardsSnapshot.docs.map(d => ({ id: d.id, ...d.data(), role: 'guard' }));

    const residencyDoc = await getDoc(doc(db, "residencies", user.residencyId));
    let adminUser = null;
    if (residencyDoc.exists()) {
        const d = residencyDoc.data();
        adminUser = {
            id: "admin",
            username: d.adminUsername,
            role: "admin",
            name: "Admin",
            phone: d.adminPhone,
            active: true,
            residencyId: user.residencyId
        };
    }

    const allUsers = [...residents, ...guards];
    if (adminUser) allUsers.unshift(adminUser);

    const blocks = await this.getBlocks();
    const flatsSnapshot = await getDocs(collection(db, "residencies", user.residencyId, "flats"));
    const flats = flatsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    return allUsers.map(u => {
      let flatDetails;
      
      if (u.role === "resident") {
        // 1. Try relational lookup (flatId)
        if (u.flatId) {
            const flat = flats.find(f => f.id === u.flatId);
            if (flat) {
              const block = blocks.find(b => b.id === flat.blockId);
              if (block) {
                flatDetails = { ...flat, block };
              }
            }
        }

        // 2. Fallback to direct fields (PDF Import)
                    if (!flatDetails && u.block && u.flat) {
            flatDetails = {
                number: u.flat,
                block: { name: normalizeBlock(u.block) || u.block }
            };
        }
      }
      
      return { ...u, flat: flatDetails };
    });
  }

  async createResident(data) {
    const user = await this.getCurrentUser();
    if (!user || user.role !== 'admin') throw new Error("Unauthorized");

    if (data.username === user.username) throw new Error("Cannot create user with same username as admin");

    const residentsRef = collection(db, "residencies", user.residencyId, "residents");
    const q = query(residentsRef, where("username", "==", data.username));
    const snap = await getDocs(q);
    if (!snap.empty) throw new Error("Username already taken");

    let blockName = null;
    let flatNumber = null;
    if (data.flatId) {
      const flatDoc = await getDoc(doc(db, "residencies", user.residencyId, "flats", data.flatId));
      if (flatDoc.exists()) {
        const flatData = flatDoc.data();
        flatNumber = String(flatData.number);
        if (flatData.blockId) {
          const blockDoc = await getDoc(doc(db, "residencies", user.residencyId, "blocks", flatData.blockId));
          if (blockDoc.exists()) {
            const bName = blockDoc.data().name;
            blockName = normalizeBlock(bName) || bName;
          }
        }
      }
    }

    await setDoc(doc(residentsRef, data.username), {
      username: data.username,
      password: data.password, 
      phone: data.phone || null,
      flatId: data.flatId,
      block: blockName || null,
      flat: flatNumber || null,
      active: true,
      createdAt: new Date().toISOString()
    });

    return { username: data.username };
  }

  async createResidentsBulk(pdfEntries) {
    const user = await this.getCurrentUser();
    if (!user || user.role !== 'admin') throw new Error("Unauthorized");

    // 1. Fetch all reference data
    const blocksSnap = await getDocs(collection(db, "residencies", user.residencyId, "blocks"));
    const blocks = blocksSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const flatsSnap = await getDocs(collection(db, "residencies", user.residencyId, "flats"));
    const flats = flatsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const residentsSnap = await getDocs(collection(db, "residencies", user.residencyId, "residents"));
    const existingUsernames = new Set(residentsSnap.docs.map(d => d.data().username));
    const occupiedFlatIds = new Set(residentsSnap.docs.map(d => d.data().flatId));

    let batch = writeBatch(db);
    let count = 0;
    let skipped = 0;
    let failed = 0; // For errors during batch (unlikely with this logic, but tracked)
    const details = []; 
    const maxBatchSize = 450;

    for (const entry of pdfEntries) {
        // Entry: { blockName, flatNumber, name, phone }
        try {
            // Validate Block
            const entryBlockName = entry.blockName.trim();
            // Match "Block A" against "Block A" or "A"
            const block = blocks.find(b => b.name.toLowerCase() === entryBlockName.toLowerCase()) || 
                          blocks.find(b => b.name.toLowerCase() === `block ${entryBlockName.toLowerCase()}`) ||
                          blocks.find(b => b.name.toLowerCase().endsWith(` ${entryBlockName.toLowerCase()}`)); // Loose match

            if (!block) {
                skipped++;
                details.push({ ...entry, status: 'skipped', reason: `Block '${entry.blockName}' not found` });
                continue;
            }

            // Validate Flat
            const flat = flats.find(f => f.blockId === block.id && f.number === entry.flatNumber.toString());
            if (!flat) {
                skipped++;
                details.push({ ...entry, status: 'skipped', reason: `Flat '${entry.flatNumber}' not found in ${block.name}` });
                continue;
            }

            // Check Occupancy
            if (occupiedFlatIds.has(flat.id)) {
                skipped++;
                details.push({ ...entry, status: 'skipped', reason: `Flat '${entry.flatNumber}' is already occupied` });
                continue;
            }

            // Generate Username (First name, lowercase, alphanumeric)
            const firstName = entry.name.trim().split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
            const username = firstName;

            if (!username) {
                skipped++;
                details.push({ ...entry, status: 'skipped', reason: `Invalid name format` });
                continue;
            }

            if (existingUsernames.has(username)) {
                skipped++;
                details.push({ ...entry, status: 'skipped', reason: `Username '${username}' already exists` });
                continue;
            }

            // Generate Password
            const namePart = entry.name.trim().toLowerCase().replace(/[^a-z]/g, '').substring(0, 4);
            let phonePart = "00";
            if (entry.phone) {
                const digits = entry.phone.replace(/[^0-9]/g, '');
                if (digits.length >= 2) {
                    phonePart = digits.substring(digits.length - 2);
                }
            }
            const password = `${namePart}${phonePart}`;

            // Add to batch
            const ref = doc(collection(db, "residencies", user.residencyId, "residents"), username);
            const normalizedBlockName = normalizeBlock(block.name) || block.name;
            batch.set(ref, {
                username,
                password, 
                phone: entry.phone || null,
                flatId: flat.id,
                block: normalizedBlockName,
                flat: String(flat.number),
                active: true,
                createdAt: new Date().toISOString()
            });

            // Update local state
            existingUsernames.add(username);
            occupiedFlatIds.add(flat.id);
            count++;
            
            if (count % maxBatchSize === 0) {
                await batch.commit();
                batch = writeBatch(db);
            }
        } catch (err) {
            console.error("Error processing entry:", entry, err);
            skipped++;
            details.push({ ...entry, status: 'failed', reason: err.message });
        }
    }

    if (count % maxBatchSize !== 0) {
        await batch.commit();
    }

    return { created: count, skipped, failed, details };
  }

  async createSystemUser(data) {
    const user = await this.getCurrentUser();
    if (!user || user.role !== 'admin') throw new Error("Unauthorized");

    const collectionName = data.role === 'guard' ? 'guards' : 'residents';
    const usersRef = collection(db, "residencies", user.residencyId, collectionName);
    
    const q = query(usersRef, where("username", "==", data.username));
    const snap = await getDocs(q);
    if (!snap.empty) throw new Error("Username already taken");

    await setDoc(doc(usersRef, data.username), {
      username: data.username,
      password: data.password,
      phone: data.phone || null,
      active: true,
      createdAt: new Date().toISOString()
    });

    return { username: data.username };
  }

  async saveUserToken(token) {
    const user = await this.getCurrentUser();
    if (!user) return;

    try {
      if (user.role === 'admin') {
        const residencyRef = doc(db, "residencies", user.residencyId);
        await updateDoc(residencyRef, { adminFcmToken: token, updatedAt: serverTimestamp() });
      } else {
        const collectionName = user.role === 'guard' ? 'guards' : 'residents';
        const userRef = doc(db, "residencies", user.residencyId, collectionName, user.username);
        await updateDoc(userRef, { fcmToken: token, updatedAt: serverTimestamp() });
      }
      console.log('FCM Token saved for user:', user.username);
    } catch (error) {
      console.error("Error saving token:", error);
    }
  }

  async removeUserToken() {
    const user = await this.getCurrentUser();
    if (!user) return;

    try {
      if (user.role === 'admin') {
        const residencyRef = doc(db, "residencies", user.residencyId);
        await updateDoc(residencyRef, { adminFcmToken: null });
      } else {
        const collectionName = user.role === 'guard' ? 'guards' : 'residents';
        const userRef = doc(db, "residencies", user.residencyId, collectionName, user.username);
        await updateDoc(userRef, { fcmToken: null });
      }
    } catch (error) {
      console.error("Error removing token:", error);
    }
  }
}

export const storage = new StorageService();
