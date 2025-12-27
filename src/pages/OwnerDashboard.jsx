import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, LogOut, Plus, Building2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export default function OwnerDashboard() {
  const [owner, setOwner] = useState(null);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Add Owner State
  const [newOwnerOpen, setNewOwnerOpen] = useState(false);
  const [newOwnerData, setNewOwnerData] = useState({ username: "", password: "", name: "" });
  const [creatingOwner, setCreatingOwner] = useState(false);

  useEffect(() => {
    const session = localStorage.getItem("owner_session");
    if (!session) {
      navigate("/owner/login");
      return;
    }
    const ownerData = JSON.parse(session);
    setOwner(ownerData);
  }, [navigate]);

  const { data: residencies = [], isLoading: loading } = useQuery({
    queryKey: ["ownerResidencies", owner?.username],
    queryFn: async () => {
      if (!owner?.username) return [];
      const res = await fetch(`/api/ownerResidencies?username=${owner.username}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      return data.residencies || [];
    },
    enabled: !!owner?.username,
    refetchInterval: 3000, // Poll every 3 seconds for real-time updates
  });

  const handleToggle = async (residencyId, currentStatus) => {
    const newStatus = currentStatus === "ON" ? "OFF" : "ON";
    
    // Optimistic update
    queryClient.setQueryData(["ownerResidencies", owner?.username], (oldData) => {
       return oldData.map(r => r.id === residencyId ? { ...r, serviceStatus: newStatus } : r);
    });

    try {
      const res = await fetch("/api/toggleService", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ residencyId, status: newStatus }),
      });

      if (!res.ok) {
        throw new Error("Failed to update");
      }
      
      toast({ title: "Success", description: `Service turned ${newStatus}` });
    } catch (error) {
      console.error("Toggle error:", error);
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
      // Revert (refetch will handle it, but immediate revert is better)
      queryClient.invalidateQueries(["ownerResidencies", owner?.username]);
    }
  };

  const handleDelete = async (residencyId) => {
    try {
      const res = await fetch("/api/deleteResidency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ residencyId }),
      });

      if (!res.ok) {
        throw new Error("Failed to delete");
      }

      toast({ title: "Success", description: "Residency deleted successfully" });
      queryClient.invalidateQueries(["ownerResidencies", owner?.username]);
    } catch (error) {
      console.error("Delete error:", error);
      toast({ title: "Error", description: "Failed to delete residency", variant: "destructive" });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("owner_session");
    navigate("/owner-login");
  };

  const handleCreateOwner = async (e) => {
    e.preventDefault();
    setCreatingOwner(true);
    try {
        const res = await fetch("/api/createOwner", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newOwnerData)
        });
        
        if (res.ok) {
            toast({ title: "Success", description: "New owner created successfully" });
            setNewOwnerOpen(false);
            setNewOwnerData({ username: "", password: "", name: "" });
        } else {
            const d = await res.json();
            toast({ title: "Error", description: d.message, variant: "destructive" });
        }
    } catch (e) {
        toast({ title: "Error", description: "Failed to create owner", variant: "destructive" });
    } finally {
        setCreatingOwner(false);
    }
  };

  if (loading && !residencies.length) return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Owner Dashboard</h1>
            <p className="text-muted-foreground">Welcome, {owner?.name}</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={newOwnerOpen} onOpenChange={setNewOwnerOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline"><Plus className="mr-2 h-4 w-4" /> Add Owner</Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add New Owner</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateOwner} className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label>Name</Label>
                            <Input value={newOwnerData.name} onChange={e => setNewOwnerData({...newOwnerData, name: e.target.value})} required />
                        </div>
                        <div className="space-y-2">
                            <Label>Username</Label>
                            <Input value={newOwnerData.username} onChange={e => setNewOwnerData({...newOwnerData, username: e.target.value})} required />
                        </div>
                        <div className="space-y-2">
                            <Label>Password</Label>
                            <Input type="password" value={newOwnerData.password} onChange={e => setNewOwnerData({...newOwnerData, password: e.target.value})} required />
                        </div>
                        <Button type="submit" className="w-full" disabled={creatingOwner}>
                            {creatingOwner ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Create Owner"}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
            <Button variant="destructive" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" /> Logout
            </Button>
          </div>
        </div>

        <div className="grid gap-6">
          {residencies.length === 0 ? (
             <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                    No residencies found for this account.
                </CardContent>
             </Card>
          ) : (
            residencies.map(residency => (
              <Card key={residency.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-2">
                     <Building2 className="h-5 w-5 text-muted-foreground" />
                     <CardTitle className="text-xl font-medium">
                        {residency.name}
                     </CardTitle>
                  </div>
                  <Badge variant={residency.serviceStatus === "ON" ? "default" : "destructive"}>
                    {residency.serviceStatus || "ON"}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between mt-4">
                    <div className="space-y-0.5">
                      <Label className="text-base">Service Status</Label>
                      <p className="text-sm text-muted-foreground">
                        {residency.serviceStatus === "ON" 
                            ? "Service is active. Users can access the portal." 
                            : "Service is disabled. Users will see maintenance page."}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <Switch
                          checked={residency.serviceStatus === "ON"}
                          onCheckedChange={() => handleToggle(residency.id, residency.serviceStatus || "ON")}
                        />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the residency "{residency.name}" from the database.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(residency.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
