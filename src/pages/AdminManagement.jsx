import { useState, useEffect } from "react";
import { Layout } from "@/components/shared/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, Loader2, Users, Building2, Home, Shield, UserCog, User,
  Search, Filter, Trash2, ShieldAlert, MoreVertical, FileText, Upload, CheckCircle, AlertCircle 
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { storage } from "@/lib/storage";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth.jsx";

export default function AdminManagement() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("users");
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addBlockOpen, setAddBlockOpen] = useState(false);
  const [addFlatOpen, setAddFlatOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  
  // New state for Role Selection
  const [selectedRole, setSelectedRole] = useState(null);
  const [residentCreationMode, setResidentCreationMode] = useState(null);
  
  // Reset mode when role changes
  useEffect(() => {
    if (!selectedRole) setResidentCreationMode(null);
  }, [selectedRole]);

  // Reset role when dialog closes
  useEffect(() => {
    if (!addUserOpen) {
      setTimeout(() => setSelectedRole(null), 300); // Delay reset to avoid UI flicker
    }
  }, [addUserOpen]);

  // Real-time users subscription
  useEffect(() => {
    const unsubscribe = storage.subscribeToUsers((data) => {
      queryClient.setQueryData(["/api/admin/users"], data);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const { data: blocks = [] } = useQuery({
    queryKey: ["/api/blocks"],
    queryFn: async () => {
      return await storage.getBlocks();
    },
  });

  // Changed from residents to all users
  const { data: users = [], refetch: refetchUsers } = useQuery({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      return await storage.getAllUsersWithDetails();
    },
    staleTime: Infinity
  });

  const { data: flats = {}, refetch: refetchFlats } = useQuery({
    queryKey: ["/api/blocks/flats"],
    queryFn: async () => {
      const flatsByBlock = {};
      for (const block of blocks) {
        const blockFlats = await storage.getFlatsByBlock(block.id);
        flatsByBlock[block.id] = blockFlats;
      }
      return flatsByBlock;
    },
    enabled: blocks.length > 0,
  });

  const addResidentMutation = useMutation({
    mutationFn: async (data) => {
      return await storage.createResident(data);
    },
    onSuccess: () => {
      toast({ title: "Resident added successfully" });
      refetchUsers();
      setAddUserOpen(false);
    },
    onError: (err) => {
      toast({ title: "Failed to add resident", description: err.message, variant: "destructive" });
    },
  });

  const addSystemUserMutation = useMutation({
    mutationFn: async (data) => {
      return await storage.createSystemUser(data);
    },
    onSuccess: (_, variables) => {
      toast({ title: `${variables.role === 'admin' ? 'Admin' : 'Guard'} added successfully` });
      refetchUsers();
      setAddUserOpen(false);
    },
    onError: (err) => {
      toast({ title: "Failed to add user", description: err.message, variant: "destructive" });
    },
  });

  const addBlockMutation = useMutation({
    mutationFn: async (data) => {
      return await storage.createBlocks(parseInt(data.count, 10));
    },
    onSuccess: () => {
      toast({ title: "Blocks created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      setAddBlockOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to add block", variant: "destructive" });
    },
  });

  const addFlatMutation = useMutation({
    mutationFn: async (data) => {
      return await storage.createFlatsBulk(data.blockId, data.floors, data.flatsPerFloor);
    },
    onSuccess: (data) => {
      toast({ title: `Successfully processed ${data.count} flats` });
      refetchFlats();
      setAddFlatOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to add flats", variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data) => {
      const { originalUsername, role, ...updates } = data;
      return await storage.updateUser(originalUsername, role, updates);
    },
    onSuccess: () => {
      toast({ title: "User updated successfully" });
      refetchUsers();
      setEditingUser(null);
    },
    onError: (err) => {
      toast({ title: "Failed to update user", description: err.message, variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async ({ username, role }) => {
      return await storage.deleteUser(username, role);
    },
    onSuccess: () => {
      toast({ title: "User deleted successfully" });
      refetchUsers();
      setDeletingUser(null);
    },
    onError: (err) => {
      toast({ title: "Failed to delete user", description: err.message, variant: "destructive" });
    },
  });

  // Sorting Logic: Admin (1) > Guard (2) > Resident (3)
  const sortedUsers = [...users].sort((a, b) => {
    const rolePriority = { admin: 1, guard: 2, resident: 3 };
    return (rolePriority[a.role] || 99) - (rolePriority[b.role] || 99);
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Society Management</h1>
            <p className="text-slate-500 mt-1">Manage blocks, flats, and user accounts</p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              const societyPath = user?.residencyName ? `/${encodeURIComponent(user.residencyName)}` : "";
              navigate(`${societyPath}/admin`);
            }}
          >
            ← Back to Dashboard
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="users">
              <Users className="w-4 h-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger value="blocks">
              <Building2 className="w-4 h-4 mr-2" />
              Blocks
            </TabsTrigger>
            <TabsTrigger value="flats">
              <Home className="w-4 h-4 mr-2" />
              Flats
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>User Management</CardTitle>
                  <p className="text-sm text-slate-500 mt-1">Add and manage users (Admins, Guards, Residents)</p>
                </div>
                <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-add-resident">
                      <Plus className="w-4 h-4 mr-2" />
                      Add User
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>
                        {!selectedRole ? "Select Role" : `Add New ${selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)}`}
                      </DialogTitle>
                      <DialogDescription>
                        {!selectedRole 
                          ? "Choose the type of user account you want to create."
                          : "Fill in the details below to create the account."}
                      </DialogDescription>
                    </DialogHeader>

                    {!selectedRole ? (
                      <div className="grid grid-cols-1 gap-4 py-4">
                        {/* Admin creation removed to enforce single-admin per residency model for now */}
                        
                        <Button 
                          variant="outline" 
                          className="h-auto p-4 flex justify-start gap-4 hover:border-primary hover:bg-primary/5"
                          onClick={() => setSelectedRole("guard")}
                        >
                          <div className="p-2 bg-slate-100 rounded-full">
                            <UserCog className="h-6 w-6 text-slate-600" />
                          </div>
                          <div className="text-left">
                            <div className="font-semibold text-slate-900">Guard</div>
                            <div className="text-sm text-slate-500">Gate entry and exit verification</div>
                          </div>
                        </Button>

                        <Button 
                          variant="outline" 
                          className="h-auto p-4 flex justify-start gap-4 hover:border-primary hover:bg-primary/5"
                          onClick={() => setSelectedRole("resident")}
                        >
                          <div className="p-2 bg-slate-100 rounded-full">
                            <User className="h-6 w-6 text-slate-600" />
                          </div>
                          <div className="text-left">
                            <div className="font-semibold text-slate-900">Resident</div>
                            <div className="text-sm text-slate-500">Flat owner/tenant with approval access</div>
                          </div>
                        </Button>
                        
                        <div className="flex justify-end pt-2">
                           <Button variant="ghost" onClick={() => setAddUserOpen(false)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {selectedRole === "resident" ? (
                          !residentCreationMode ? (
                             <div className="grid grid-cols-1 gap-4 py-4">
                               <Button variant="outline" className="h-auto p-4 flex justify-start gap-4 hover:bg-slate-50" onClick={() => setResidentCreationMode('manual')}>
                                 <div className="p-2 bg-blue-100 rounded-full">
                                    <User className="h-6 w-6 text-blue-600" />
                                 </div>
                                 <div className="text-left">
                                    <div className="font-semibold text-slate-900">Add Single Resident</div>
                                    <div className="text-sm text-slate-500">Fill form manually</div>
                                 </div>
                               </Button>
                               <Button variant="outline" className="h-auto p-4 flex justify-start gap-4 hover:bg-slate-50" onClick={() => setResidentCreationMode('bulk')}>
                                 <div className="p-2 bg-orange-100 rounded-full">
                                    <FileText className="h-6 w-6 text-orange-600" />
                                 </div>
                                 <div className="text-left">
                                    <div className="font-semibold text-slate-900">Upload Resident PDF</div>
                                    <div className="text-sm text-slate-500">Bulk create from file</div>
                                 </div>
                               </Button>
                               <div className="flex justify-end pt-2">
                                  <Button variant="ghost" onClick={() => setSelectedRole(null)}>Back</Button>
                               </div>
                             </div>
                          ) : residentCreationMode === 'manual' ? (
                            <AddResidentForm
                              blocks={blocks}
                              flats={flats}
                              onSubmit={(data) => addResidentMutation.mutate(data)}
                              isLoading={addResidentMutation.isPending}
                              onCancel={() => setResidentCreationMode(null)}
                            />
                          ) : (
                             <BulkResidentForm 
                               onSuccess={() => refetchUsers()}
                               onCancel={() => setResidentCreationMode(null)}
                             />
                          )
                        ) : (
                          <AddSystemUserForm 
                            role={selectedRole}
                            onSubmit={(data) => addSystemUserMutation.mutate({ ...data, role: selectedRole })}
                            isLoading={addSystemUserMutation.isPending}
                            onCancel={() => setSelectedRole(null)}
                          />
                        )}
                      </>
                    )}
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {sortedUsers.length === 0 ? (
                    <p className="text-slate-500 text-center py-8">No users added yet</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-slate-50">
                            <th className="text-left p-2 font-semibold">Username</th>
                            <th className="text-left p-2 font-semibold">Role</th>
                            <th className="text-left p-2 font-semibold">Block</th>
                            <th className="text-left p-2 font-semibold">Flat</th>
                            <th className="text-left p-2 font-semibold">Status</th>
                            <th className="text-right p-2 font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedUsers.map((user) => (
                            <tr key={user.id} className="border-b hover:bg-slate-50">
                              <td className="p-2 font-medium">{user.username}</td>
                              <td className="p-2">
                                <span className={`text-xs px-2 py-1 rounded capitalize font-medium
                                  ${user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 
                                    user.role === 'guard' ? 'bg-blue-100 text-blue-800' : 
                                    'bg-slate-100 text-slate-800'}`}>
                                  {user.role}
                                </span>
                              </td>
                              <td className="p-2">{user.flat?.block?.name || user.block || "-"}</td>
                              <td className="p-2">{user.flat?.number || user.flat || "-"}</td>
                              <td className="p-2">
                                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                                  Active
                                </span>
                              </td>
                              <td className="p-2 text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                      <span className="sr-only">Open menu</span>
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => setEditingUser(user)}>
                                      <UserCog className="mr-2 h-4 w-4" />
                                      Edit User
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                      onClick={() => setDeletingUser(user)}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete User
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Blocks Tab */}
          <TabsContent value="blocks" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>Blocks</CardTitle>
                  <p className="text-sm text-slate-500 mt-1">Manage society blocks</p>
                </div>
                <Dialog open={addBlockOpen} onOpenChange={setAddBlockOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-add-block">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Block
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Blocks</DialogTitle>
                    </DialogHeader>
                    <AddBlockForm
                      onSubmit={(data) => addBlockMutation.mutate(data)}
                      isLoading={addBlockMutation.isPending}
                    />
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {blocks.map((block) => (
                    <div
                      key={block.id}
                      className="p-4 border rounded-lg hover:bg-slate-50 transition"
                      data-testid={`card-block-${block.id}`}
                    >
                      <h3 className="font-semibold text-slate-900">{block.name}</h3>
                      <p className="text-sm text-slate-500">ID: {block.id}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Flats Tab */}
          <TabsContent value="flats" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>Flats</CardTitle>
                  <p className="text-sm text-slate-500 mt-1">Manage flats by block</p>
                </div>
                <Dialog open={addFlatOpen} onOpenChange={setAddFlatOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-add-flat">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Flat
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Flat</DialogTitle>
                    </DialogHeader>
                    <AddFlatForm
                      blocks={blocks}
                      onSubmit={(data) => addFlatMutation.mutate(data)}
                      isLoading={addFlatMutation.isPending}
                    />
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {blocks.map((block) => (
                    <div key={block.id}>
                      <h3 className="font-semibold text-slate-900 mb-3">{block.name}</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {(flats[block.id] || []).map((flat) => (
                          <div
                            key={flat.id}
                            className="p-3 border rounded-lg bg-slate-50 text-center"
                            data-testid={`card-flat-${flat.id}`}
                          >
                            <p className="font-semibold">Flat {flat.number}</p>
                            <p className="text-xs text-slate-500">Floor {flat.floor}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit User Dialog */}
        <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
           <DialogContent className="max-w-md">
              <DialogHeader>
                 <DialogTitle>Edit User</DialogTitle>
                 <DialogDescription>
                    Update details for {editingUser?.username}
                 </DialogDescription>
              </DialogHeader>
              {editingUser && (
                 <EditUserForm
                    user={editingUser}
                    blocks={blocks}
                    flats={flats}
                    onSubmit={(data) => updateUserMutation.mutate({ 
                       originalUsername: editingUser.username, 
                       role: editingUser.role,
                       ...data
                    })}
                    isLoading={updateUserMutation.isPending}
                    onCancel={() => setEditingUser(null)}
                 />
              )}
           </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
           <AlertDialogContent>
              <AlertDialogHeader>
                 <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                 <AlertDialogDescription>
                    This will permanently delete the user <strong>{deletingUser?.username}</strong>. 
                    This action cannot be undone.
                 </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                 <AlertDialogCancel>Cancel</AlertDialogCancel>
                 <AlertDialogAction 
                    className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                    onClick={() => deleteUserMutation.mutate({ 
                       username: deletingUser.username, 
                       role: deletingUser.role 
                    })}
                    disabled={deleteUserMutation.isPending}
                 >
                    {deleteUserMutation.isPending ? "Deleting..." : "Delete"}
                 </AlertDialogAction>
              </AlertDialogFooter>
           </AlertDialogContent>
        </AlertDialog>

      </div>
    </Layout>
  );
}

function AddResidentForm({
  blocks,
  flats,
  onSubmit,
  isLoading,
  onCancel,
}) {
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    phone: "",
    blockId: "",
    flatId: "",
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      username: formData.username,
      password: formData.password,
      phone: formData.phone,
      flatId: formData.flatId || undefined,
    });
  };

  const selectedBlockFlats = formData.blockId ? flats[formData.blockId] || [] : [];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          placeholder="Enter username"
          value={formData.username}
          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
          required
          data-testid="input-username"
        />
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="Enter password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          required
          data-testid="input-password"
        />
      </div>

      <div>
        <Label htmlFor="phone">Phone (Optional)</Label>
        <Input
          id="phone"
          placeholder="Enter phone number"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          data-testid="input-phone"
        />
      </div>

      <div>
        <Label htmlFor="block">Block</Label>
        <Select value={formData.blockId} onValueChange={(value) => setFormData({ ...formData, blockId: value, flatId: "" })}>
          <SelectTrigger data-testid="select-block">
            <SelectValue placeholder="Select block" />
          </SelectTrigger>
          <SelectContent>
            {blocks.map((block) => (
              <SelectItem key={block.id} value={String(block.id)}>
                {block.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {formData.blockId && (
        <div>
          <Label htmlFor="flat">Flat</Label>
          <Select value={formData.flatId} onValueChange={(value) => setFormData({ ...formData, flatId: value })}>
            <SelectTrigger data-testid="select-flat">
              <SelectValue placeholder="Select flat" />
            </SelectTrigger>
            <SelectContent>
              {selectedBlockFlats.map((flat) => (
                <SelectItem key={flat.id} value={String(flat.id)}>
                  Flat {flat.number} (Floor {flat.floor})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="w-1/3" onClick={onCancel}>Back</Button>
        <Button type="submit" disabled={isLoading} className="w-2/3" data-testid="button-create-resident">
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            "Create Resident"
          )}
        </Button>
      </div>
    </form>
  );
}

function AddSystemUserForm({
  role,
  onSubmit,
  isLoading,
  onCancel
}) {
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    phone: "",
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          placeholder="Enter username"
          value={formData.username}
          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
          required
        />
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="Enter password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          required
        />
      </div>

      <div>
        <Label htmlFor="phone">Phone (Optional)</Label>
        <Input
          id="phone"
          placeholder="Enter phone number"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
        />
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="w-1/3" onClick={onCancel}>Back</Button>
        <Button type="submit" disabled={isLoading} className="w-2/3">
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            `Create ${role.charAt(0).toUpperCase() + role.slice(1)}`
          )}
        </Button>
      </div>
    </form>
  );
}

function AddBlockForm({ onSubmit, isLoading }) {
  const [count, setCount] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ count });
    setCount("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="count">Number of Blocks</Label>
        <Input
          id="count"
          type="number"
          min={1}
          max={26}
          placeholder="Enter number of blocks (e.g., 3)"
          value={count}
          onChange={(e) => setCount(e.target.value)}
          required
          data-testid="input-block-count"
        />
      </div>
      <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-create-block">
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Creating...
          </>
        ) : (
          "Create Blocks"
        )}
      </Button>
    </form>
  );
}

function AddFlatForm({ blocks, onSubmit, isLoading }) {
  const [formData, setFormData] = useState({
    blockId: "all",
    floors: "",
    flatsPerFloor: "",
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      blockId: formData.blockId,
      floors: formData.floors,
      flatsPerFloor: formData.flatsPerFloor,
    });
    setFormData({ blockId: "all", floors: "", flatsPerFloor: "" });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-blue-50 p-3 rounded-md mb-4">
        <p className="text-sm text-blue-700">
          <strong>Bulk Generator:</strong> This will automatically create flats for the selected blocks.
          Existing flats will be skipped.
        </p>
      </div>

      <div>
        <Label htmlFor="block">Target Block(s)</Label>
        <Select
          value={formData.blockId}
          onValueChange={(value) => setFormData({ ...formData, blockId: value })}
        >
          <SelectTrigger data-testid="select-block">
            <SelectValue placeholder="Select block" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="font-semibold">All Blocks (Apply to all)</SelectItem>
            {blocks.map((block) => (
              <SelectItem key={block.id} value={String(block.id)}>
                {block.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="floors">Number of Floors</Label>
          <Input
            id="floors"
            type="number"
            min="1"
            max="100"
            placeholder="e.g. 5"
            value={formData.floors}
            onChange={(e) => setFormData({ ...formData, floors: e.target.value })}
            required
            data-testid="input-floors"
          />
        </div>
        <div>
          <Label htmlFor="flatsPerFloor">Flats per Floor</Label>
          <Input
            id="flatsPerFloor"
            type="number"
            min="1"
            max="20"
            placeholder="e.g. 4"
            value={formData.flatsPerFloor}
            onChange={(e) => setFormData({ ...formData, flatsPerFloor: e.target.value })}
            required
            data-testid="input-flats-per-floor"
          />
        </div>
      </div>

      <div className="text-xs text-slate-500">
        Output example: Floor 1 → 101-{100 + (parseInt(formData.flatsPerFloor) || 4)}
      </div>

      <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-create-flat">
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Generating Flats...
          </>
        ) : (
          "Generate Flats"
        )}
      </Button>
    </form>
  );
}

function BulkResidentForm({ onCancel, onSuccess }) {
  const { toast } = useToast();
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, processing, success
  const [result, setResult] = useState(null);

  const handleProcess = async () => {
     if (!file) return;
     setStatus('processing');
     try {
        const user = await storage.getCurrentUser();
        if (!user || !user.residencyId) {
            throw new Error("Session invalid. Please refresh.");
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("residencyId", user.residencyId);

        // Updated API Endpoint
        const response = await fetch("/api/importResidents", {
           method: "POST",
           body: formData,
        });

        // 1. Read as text first (safest)
        const textResponse = await response.text();
        
        // 2. Try parsing as JSON
        let res;
        try {
            res = JSON.parse(textResponse);
        } catch (jsonError) {
            console.error("JSON Parse Error. Raw response:", textResponse);
            throw new Error(`Server returned invalid JSON: ${textResponse.substring(0, 100)}...`);
        }
        
        if (!res.success) {
           throw new Error(res.message || "Upload failed");
        }

        setResult(res);
        setStatus('success');
        
        toast({
            title: "Import Successful",
            description: `Created ${res.created} residents.`,
        });

        // Trigger refresh if needed
        if (onSuccess) onSuccess(false);

     } catch (e) {
        console.error(e);
        toast({
            variant: "destructive",
            title: "Import Failed",
            description: e.message
        });
        setStatus('idle');
     }
  };

  const downloadCredentialsPDF = () => {
      if (!result?.residents || result.residents.length === 0) return;

      const doc = new jsPDF();
      
      // Title
      doc.setFontSize(20);
      doc.setTextColor(40, 40, 40);
      doc.text("Resident Login Credentials", 105, 15, { align: "center" });
      
      // Subtitle
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated on ${new Date().toLocaleDateString()}`, 105, 22, { align: "center" });
      doc.text("Please distribute these credentials securely to the respective residents.", 105, 27, { align: "center" });

      const tableColumn = ["Block", "Flat", "Resident Name", "Username", "Password", "Login URL"];
      const tableRows = [];

      result.residents.forEach(resident => {
          const residentData = [
              resident.block,
              resident.flat,
              resident.name,
              resident.username,
              resident.password,
              "https://visitsafe.vercel.app/login"
          ];
          tableRows.push(residentData);
      });

      autoTable(doc, {
          head: [tableColumn],
          body: tableRows,
          startY: 35,
          theme: 'grid',
          headStyles: { fillColor: [66, 133, 244], textColor: 255, fontStyle: 'bold' },
          styles: { fontSize: 9, cellPadding: 3 },
          alternateRowStyles: { fillColor: [245, 247, 250] },
      });

      doc.save("Resident_Credentials.pdf");
      toast({ title: "PDF Downloaded", description: "Credentials PDF has been saved to your device." });
  };

  if (status === 'success' && result) {
     return (
        <div className="space-y-6 max-h-[80vh] overflow-y-auto p-2">
           <div className="text-center space-y-4 pt-4">
               <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto shadow-sm">
                   <CheckCircle className="w-10 h-10 text-green-600" />
               </div>
               <div className="space-y-1">
                   <h3 className="text-2xl font-bold text-slate-900">Import Complete</h3>
                   <p className="text-slate-500 text-lg">
                       Successfully processed the resident list.
                   </p>
               </div>
           </div>

           <div className="grid grid-cols-3 gap-6 text-center py-4">
               <div className="p-4 bg-green-50 rounded-xl border border-green-100 shadow-sm">
                   <div className="text-3xl font-bold text-green-700">{result.created}</div>
                   <div className="text-sm text-green-600 font-bold uppercase tracking-wider mt-1">Created</div>
               </div>
               <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 shadow-sm">
                   <div className="text-3xl font-bold text-amber-700">{result.skipped}</div>
                   <div className="text-sm text-amber-600 font-bold uppercase tracking-wider mt-1">Skipped</div>
               </div>
               <div className="p-4 bg-red-50 rounded-xl border border-red-100 shadow-sm">
                   <div className="text-3xl font-bold text-red-700">{result.failed}</div>
                   <div className="text-sm text-red-600 font-bold uppercase tracking-wider mt-1">Failed</div>
               </div>
           </div>

           <div className="border rounded-xl overflow-hidden shadow-sm bg-white">
               <div className="bg-slate-50 px-6 py-4 border-b flex flex-col sm:flex-row justify-between items-center gap-4">
                   <span className="font-semibold text-slate-900">New Residents Preview</span>
                   <Button 
                       variant="default" 
                       size="sm" 
                       onClick={downloadCredentialsPDF} 
                       className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all hover:scale-105"
                   >
                       <FileText className="w-4 h-4 mr-2" />
                       Download Credentials PDF
                   </Button>
               </div>
               <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                   <table className="w-full text-sm text-left">
                       <thead className="text-xs text-slate-500 bg-slate-50 sticky top-0 uppercase tracking-wider font-semibold shadow-sm z-10">
                           <tr>
                               <th className="px-6 py-4 font-bold text-slate-600">Block</th>
                               <th className="px-6 py-4 font-bold text-slate-600">Flat</th>
                               <th className="px-6 py-4 font-bold text-slate-600">Name</th>
                               <th className="px-6 py-4 font-bold text-slate-600">Phone</th>
                               <th className="px-6 py-4 font-bold text-slate-600">Username</th>
                           </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                           {result.residents.map((r, i) => (
                               <tr key={i} className={`hover:bg-blue-50/50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                                   <td className="px-6 py-3 font-medium text-slate-700">{r.block}</td>
                                   <td className="px-6 py-3 font-medium text-slate-700">{r.flat}</td>
                                   <td className="px-6 py-3 text-slate-900">{r.name}</td>
                                   <td className="px-6 py-3 text-slate-500 font-mono text-xs">{r.phone}</td>
                                   <td className="px-6 py-3">
                                       <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-mono font-medium">
                                           {r.username}
                                       </span>
                                   </td>
                               </tr>
                           ))}
                       </tbody>
                   </table>
               </div>
           </div>
           
           {(result.skippedDetails?.length > 0 || result.failedDetails?.length > 0) && (
               <div className="space-y-3 pt-2">
                   <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Issues Found</div>
                   <div className="max-h-40 overflow-y-auto border rounded-xl bg-slate-50 p-4 text-xs font-mono space-y-2 shadow-inner">
                       {result.failedDetails?.map((f, i) => (
                           <div key={`fail-${i}`} className="flex items-start gap-2 text-red-600 bg-red-50 p-2 rounded border border-red-100">
                               <span className="font-bold shrink-0">[FAIL]</span>
                               <span>{f.line} - {f.reason}</span>
                           </div>
                       ))}
                       {result.skippedDetails?.map((s, i) => (
                           <div key={`skip-${i}`} className="flex items-start gap-2 text-amber-700 bg-amber-50 p-2 rounded border border-amber-100">
                               <span className="font-bold shrink-0">[SKIP]</span>
                               <span>{s.line} - {s.reason}</span>
                           </div>
                       ))}
                   </div>
               </div>
           )}

           <div className="pt-4 pb-2">
               <Button 
                   onClick={onCancel} 
                   className="w-full h-12 text-lg font-medium shadow-lg bg-slate-900 hover:bg-slate-800 transition-all hover:scale-[1.01] active:scale-[0.99]"
               >
                   Close & Return
               </Button>
           </div>
        </div>
     )
  }

  return (
     <div className="space-y-6">
        {status === 'processing' ? (
            <div className="text-center py-12 space-y-4">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto" />
                <div>
                    <h3 className="text-lg font-semibold text-slate-900">Processing PDF...</h3>
                    <p className="text-slate-500">Reading residents, checking duplicates, and creating accounts.</p>
                </div>
            </div>
        ) : (
            <>
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-10 text-center hover:bg-slate-50 transition-colors relative group cursor-pointer">
                   <input 
                     type="file" 
                     accept=".pdf" 
                     onChange={e => setFile(e.target.files[0])} 
                     className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                     id="pdf-upload" 
                   />
                   <div className="pointer-events-none transition-transform group-hover:scale-105 duration-200">
                      <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Upload className="w-8 h-8" />
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900">
                         {file ? file.name : "Upload Resident List PDF"}
                      </h3>
                      <p className="text-sm text-slate-500 mt-2 max-w-xs mx-auto">
                         {file ? "Ready to process" : "Drag and drop or click to browse. Supports standard format."}
                      </p>
                      {!file && (
                          <div className="mt-4 text-xs text-slate-400 bg-slate-100 inline-block px-3 py-1 rounded-full">
                             Format: Block [A] [101] [Name] [Phone]
                          </div>
                      )}
                   </div>
                </div>
                
                <div className="flex gap-3">
                    <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
                    <Button 
                        onClick={handleProcess} 
                        disabled={!file} 
                        className="flex-1"
                    >
                        Start Import
                    </Button>
                </div>
            </>
        )}
     </div>
  );
}

function EditUserForm({ user, blocks, flats, onSubmit, isLoading, onCancel }) {
  const [formData, setFormData] = useState({
    username: user.username || "",
    password: user.password || "",
    phone: user.phone || "",
    blockId: user.flatId ? (user.flat?.block?.id || "") : "", // Try to derive from relation
    flatId: user.flatId || "",
    // Fallback fields for PDF imports that are not linked
    block: user.block || "", 
    flat: user.flat || ""
  });

  // Effect to set initial block/flat if linked via flatId
  useEffect(() => {
     if (user.flatId && user.flat?.block?.id) {
         setFormData(prev => ({
             ...prev,
             blockId: user.flat.block.id,
             flatId: user.flatId
         }));
     }
  }, [user]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const updates = {
      username: formData.username,
      phone: formData.phone
    };
    
    if (formData.password) updates.password = formData.password;
    
    if (user.role === 'resident') {
        if (formData.flatId) {
            updates.flatId = formData.flatId;
            updates.block = null; // Clear manual fields if linked
            updates.flat = null;
        } else {
             if (formData.block) updates.block = formData.block;
             if (formData.flat) updates.flat = formData.flat;
        }
    }
    
    onSubmit(updates);
  };

  const selectedBlockFlats = formData.blockId ? flats[formData.blockId] || [] : [];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="edit-username">Username</Label>
        <Input
          id="edit-username"
          value={formData.username}
          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
          required
          disabled={user.role === 'admin' && user.username === 'admin'} 
        />
      </div>

      <div>
        <Label htmlFor="edit-password">New Password (Optional)</Label>
        <Input
          id="edit-password"
          type="password"
          placeholder="Leave blank to keep current"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
        />
      </div>

      <div>
        <Label htmlFor="edit-phone">Phone</Label>
        <Input
          id="edit-phone"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
        />
      </div>

      {user.role === 'resident' && (
        <>
            <div>
                <Label htmlFor="edit-block">Block</Label>
                <Select 
                    value={formData.blockId} 
                    onValueChange={(value) => setFormData({ ...formData, blockId: value, flatId: "" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={formData.block || "Select block"} />
                  </SelectTrigger>
                  <SelectContent>
                    {blocks.map((block) => (
                      <SelectItem key={block.id} value={String(block.id)}>
                        {block.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
            </div>

            {formData.blockId && (
                <div>
                  <Label htmlFor="edit-flat">Flat</Label>
                  <Select 
                    value={formData.flatId} 
                    onValueChange={(value) => setFormData({ ...formData, flatId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={formData.flat || "Select flat"} />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedBlockFlats.map((flat) => (
                        <SelectItem key={flat.id} value={String(flat.id)}>
                          Flat {flat.number} (Floor {flat.floor})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
            )}
        </>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Update User
        </Button>
      </div>
    </form>
  );
}
