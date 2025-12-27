import { Layout } from "@/components/shared/Layout";
import { useStats } from "@/hooks/use-stats";
import { useAdminVisitorLogs } from "@/hooks/use-admin-visitor-logs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, UserPlus, UserCheck, Clock, CheckCircle, XCircle, LogIn, LogOut, Settings, Bell } from "lucide-react";
import { Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth.jsx";
import { useEffect, memo, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";


export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: logs, isLoading: logsLoading } = useAdminVisitorLogs();
  const { toast } = useToast();
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  const handleBroadcast = async () => {
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      toast({ title: "Error", description: "Title and message are required", variant: "destructive" });
      return;
    }

    setSendingBroadcast(true);
    try {
      const response = await fetch("/api/broadcast-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          residencyId: user.residencyId,
          title: broadcastTitle,
          body: broadcastMessage
        })
      });

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || "Failed to send broadcast");

      if (result.sentCount === 0 && result.message) {
         toast({ title: "Notice", description: result.message });
      } else {
         toast({ title: "Success", description: `Notification sent to ${result.sentCount} residents.` });
      }
      
      setBroadcastOpen(false);
      setBroadcastTitle("");
      setBroadcastMessage("");
    } catch (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSendingBroadcast(false);
    }
  };

  useEffect(() => {
    if (user?.residencyName) {
      document.title = `${user.residencyName} Admin Dashboard`;
    }
  }, [user?.residencyName]);

  if (statsLoading || logsLoading) {
    return (
      <Layout>
        <div className="flex justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const getStatusColor = (status) => {
    const colors = {
      pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
      approved: "bg-green-100 text-green-800 border-green-300",
      rejected: "bg-red-100 text-red-800 border-red-300",
      entered: "bg-blue-100 text-blue-800 border-blue-300",
      exited: "bg-gray-100 text-gray-800 border-gray-300",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case "approved": return <CheckCircle className="w-4 h-4" />;
      case "rejected": return <XCircle className="w-4 h-4" />;
      case "entered": return <LogIn className="w-4 h-4" />;
      case "exited": return <LogOut className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusLabel = (status) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getStatusFlow = (status) => {
    const flow = ["pending"];
    if (["approved", "entered", "exited"].includes(status)) flow.push("approved");
    if (status === "rejected") flow.push("rejected");
    if (["entered", "exited"].includes(status)) flow.push("entered");
    if (status === "exited") flow.push("exited");
    return flow;
  };

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900" data-testid="text-admin-title">{user?.residencyName} Admin Dashboard</h1>
            <p className="text-slate-500 mt-1">Real-time visitor entry management system overview for {user?.residencyName}</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={broadcastOpen} onOpenChange={setBroadcastOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                  <Bell className="w-4 h-4" />
                  Send Notification
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Send Notification to All Residents</DialogTitle>
                  <DialogDescription>
                    This will send a push notification to all residents of {user?.residencyName}.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input 
                      id="title" 
                      placeholder="e.g. Society Meeting" 
                      value={broadcastTitle}
                      onChange={(e) => setBroadcastTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea 
                      id="message" 
                      placeholder="e.g. Please gather at the clubhouse at 6 PM." 
                      value={broadcastMessage}
                      onChange={(e) => setBroadcastMessage(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setBroadcastOpen(false)}>Cancel</Button>
                  <Button onClick={handleBroadcast} disabled={sendingBroadcast}>
                    {sendingBroadcast ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      "Send Notification"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button 
              onClick={() => {
                const societyPath = user.residencyName ? `/${encodeURIComponent(user.residencyName)}` : "";
                navigate(`${societyPath}/admin/management`);
              }}
              data-testid="button-management"
              className="gap-2"
            >
              <Settings className="w-4 h-4" />
              Management
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard 
            title="Total Visitors" 
            value={stats?.totalVisitors || 0} 
            icon={<Users className="h-6 w-6 text-blue-600" />}
            description="All time entries"
            data-testid="stat-total-visitors"
          />
          <StatCard 
            title="Pending Requests" 
            value={stats?.pendingRequests || 0} 
            icon={<Clock className="h-6 w-6 text-amber-600" />}
            description="Awaiting resident action"
            data-testid="stat-pending-requests"
          />
          <StatCard 
            title="Currently On Campus" 
            value={stats?.activeVisitors || 0} 
            icon={<UserCheck className="h-6 w-6 text-emerald-600" />}
            description="Checked in now"
            data-testid="stat-active-visitors"
          />
          <StatCard 
            title="Approved Today" 
            value={logs?.filter((r) => r.status === "approved").length || 0} 
            icon={<CheckCircle className="h-6 w-6 text-green-600" />}
            description="Total approved"
            data-testid="stat-approved-today"
          />
        </div>

        {/* QR Code for Visitor Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Visitor Form QR Code</CardTitle>
            <CardDescription>Scan this QR code to open the visitor registration form for {user?.residencyName}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center p-6">
            {user?.residencyName ? (
              <div className="flex flex-col items-center gap-4">
                 <div className="bg-white p-4 rounded-xl shadow-lg border">
                    <QRCodeCanvas value={`${window.location.origin}/visitor-form/${encodeURIComponent(user.residencyName)}`} size={200} />
                 </div>
                 <div className="text-center">
                    <p className="text-sm text-slate-500 mb-2">Visitor Link:</p>
                    <code className="bg-slate-100 px-3 py-1 rounded text-sm text-slate-700 break-all">
                        {`${window.location.origin}/visitor-form/${encodeURIComponent(user.residencyName)}`}
                    </code>
                 </div>
                 <Button 
                    variant="outline" 
                    onClick={() => {
                        const url = `${window.location.origin}/visitor-form/${encodeURIComponent(user.residencyName)}`;
                        navigator.clipboard.writeText(url);
                    }}
                 >
                    Copy Link
                 </Button>
              </div>
            ) : (
                <div className="text-slate-500">Loading residency info...</div>
            )}
          </CardContent>
        </Card>

        {/* Data Flow Visualization */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Visitor Entry Data Flow</CardTitle>
            <p className="text-sm text-slate-500 mt-1">How visitor requests move through the system</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Status Flow Pipeline */}
              <div className="bg-slate-50 rounded-lg p-6">
                <div className="grid grid-cols-5 gap-2 text-center">
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-yellow-200 flex items-center justify-center mb-2">
                      <Clock className="w-6 h-6 text-yellow-700" />
                    </div>
                    <span className="text-xs font-semibold text-slate-700">Pending</span>
                    <span className="text-xs text-slate-500 mt-1">Visitor submits</span>
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="w-8 h-1 bg-slate-300"></div>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-green-200 flex items-center justify-center mb-2">
                      <CheckCircle className="w-6 h-6 text-green-700" />
                    </div>
                    <span className="text-xs font-semibold text-slate-700">Approved</span>
                    <span className="text-xs text-slate-500 mt-1">Resident approves</span>
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="w-8 h-1 bg-slate-300"></div>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-blue-200 flex items-center justify-center mb-2">
                      <LogIn className="w-6 h-6 text-blue-700" />
                    </div>
                    <span className="text-xs font-semibold text-slate-700">Entered</span>
                    <span className="text-xs text-slate-500 mt-1">Guard verifies</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-6 text-center">
                  Visitors can also be rejected at the Pending stage. After entry, they exit when leaving.
                </p>
              </div>

              {/* Count by Status */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {["pending", "approved", "rejected", "entered", "exited"].map(status => (
                  <div key={status} className="bg-slate-100 rounded p-3 text-center">
                    <div className="text-2xl font-bold text-slate-900">
                      {logs?.filter((r) => r.status === status).length || 0}
                    </div>
                    <div className="text-xs text-slate-600 capitalize font-medium">{status}</div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Visitor Request Logs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Complete Visitor Request Log</CardTitle>
            <p className="text-sm text-slate-500 mt-1">All visitor entries with precise data and status flow</p>
          </CardHeader>
          <CardContent>
            {(!logs || logs.length === 0) ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 font-medium">No visitor requests yet</p>
                <p className="text-slate-400 text-sm">Visitor requests will appear here</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left p-3 font-semibold text-slate-700">ID</th>
                      <th className="text-left p-3 font-semibold text-slate-700">Visitor Name</th>
                      <th className="text-left p-3 font-semibold text-slate-700">Phone</th>
                      <th className="text-left p-3 font-semibold text-slate-700">Block • Flat</th>
                      <th className="text-left p-3 font-semibold text-slate-700">Purpose</th>
                      <th className="text-center p-3 font-semibold text-slate-700">Status Flow</th>
                      <th className="text-left p-3 font-semibold text-slate-700">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((request) => (
                      <tr key={request.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`row-visitor-${request.id}`}>
                        <td className="p-3 text-slate-700 font-mono text-xs">#{request.id}</td>
                        <td className="p-3 text-slate-900 font-medium">{request.visitorName}</td>
                        <td className="p-3 text-slate-600">{request.visitorPhone}</td>
                        <td className="p-3 text-slate-700">
                          <span className="font-mono text-xs">
                            {request.flat.block.name} • Flat {request.flat.number}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600">{request.purpose}</td>
                        <td className="p-3">
                          <div className="flex gap-1 justify-center flex-wrap">
                            {getStatusFlow(request.status).map((status) => (
                              <Badge 
                                key={status} 
                                variant="outline"
                                className={`${getStatusColor(status)} border text-xs capitalize flex items-center gap-1`}
                              >
                                {getStatusIcon(status)}
                                {getStatusLabel(status)}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="p-3 text-slate-500 text-xs" data-testid={`text-timestamp-${request.id}`}>
                          {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Network Data Flow Explanation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">System Data Flow Architecture</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 className="font-semibold text-blue-900 mb-2">Public Entry</h3>
                <p className="text-sm text-blue-800">
                  Visitor scans QR → Submits form (Name, Phone, Block, Flat, Purpose) → Request created with PENDING status
                </p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <h3 className="font-semibold text-green-900 mb-2">Resident Approval</h3>
                <p className="text-sm text-green-800">
                  Resident logs in → Sees requests for their flat → Approves or Rejects → Status updates in real-time
                </p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                <h3 className="font-semibold text-purple-900 mb-2">Guard Verification</h3>
                <p className="text-sm text-purple-800">
                  Guard sees approved requests → Marks ENTERED when visitor checks in → Marks EXITED when visitor leaves
                </p>
              </div>
            </div>
            <div className="bg-slate-100 p-4 rounded-lg border-l-4 border-slate-400">
              <p className="text-sm text-slate-700">
                <strong>Admin Visibility:</strong> This dashboard shows all requests across all flats and blocks in real-time. Each request flows through the system in a precise, trackable way: Visitor Submission → Resident Decision → Guard Verification → System Completion.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

const StatCard = memo(function StatCard({ 
  title, 
  value, 
  icon, 
  description,
  ...props
}) {
  return (
    <Card {...props}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-slate-500 text-sm mb-1">{title}</div>
            <div className="text-3xl font-bold font-display text-slate-900">{value}</div>
            <div className="text-xs text-slate-400 mt-2">{description}</div>
          </div>
          <div className="p-2 bg-slate-100 rounded-lg">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
});
