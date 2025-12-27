import { useState, useEffect } from "react";
import { Layout } from "@/components/shared/Layout";
import { useVisitorRequests } from "@/hooks/use-visitor-requests";
import { RequestCard } from "@/components/shared/RequestCard";
import { Input } from "@/components/ui/input";
import { Search, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth.jsx";

export default function GuardDashboard() {
  const { user } = useAuth();
  const { data: requests, isLoading } = useVisitorRequests();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (user?.residencyName) {
      document.title = `${user.residencyName} Guard Dashboard`;
    }
  }, [user?.residencyName]);

  // In a real app, search would be server-side. For now client-side filtering.
  // Guards care about: Approved (to enter), Entered (to exit), Pending (to check)
  const relevantRequests = requests?.filter(r => 
    ["approved", "entered", "pending"].includes(r.status) &&
    (r.visitorName.toLowerCase().includes(search.toLowerCase()) ||
     r.flat.number.includes(search) ||
     r.flat.block.name.toLowerCase().includes(search.toLowerCase()))
  ) || [];

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">{user?.residencyName} Security Gate</h1>
          <p className="text-slate-500">Verify entry and exit for {user?.residencyName}.</p>
        </div>
        
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search visitor, block, or flat..." 
            className="pl-9 bg-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {relevantRequests.map((req) => (
            <RequestCard key={req.id} request={req} variant="guard" />
          ))}
          
          {relevantRequests.length === 0 && (
            <div className="col-span-full p-12 text-center text-slate-400">
              <p>No active requests matching your search.</p>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
