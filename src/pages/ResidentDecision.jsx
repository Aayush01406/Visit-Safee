import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { storage } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle, User, MapPin, Clock } from "lucide-react";

export default function ResidentDecision() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [visitorData, setVisitorData] = useState(null);
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);

  // Get URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const visitorId = urlParams.get('visitorId');
  const token = urlParams.get('token');
  const suggestedAction = urlParams.get('action');

  useEffect(() => {
    const loadData = async () => {
      try {
        // Check if user is logged in
        const currentUser = await storage.getCurrentUser();
        if (!currentUser || currentUser.role !== 'resident') {
          setLocation('/login');
          return;
        }
        setUser(currentUser);

        // Validate parameters
        if (!visitorId || !token) {
          setError('Invalid approval link');
          return;
        }

        // Fetch visitor data
        const response = await fetch(`/api/visitor-details?visitorId=${visitorId}&token=${token}`);
        if (!response.ok) {
          throw new Error('Failed to load visitor details');
        }
        
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || 'Invalid request');
        }

        setVisitorData(data.visitor);
      } catch (err) {
        console.error('Error loading visitor data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [visitorId, token, setLocation]);

  const handleDecision = async (action) => {
    if (!visitorId || !token || !user) return;

    setProcessing(true);
    try {
      const response = await fetch('/api/visitor-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorId,
          token,
          action,
          residentId: user.username
        })
      });

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: action === 'approve' ? 'Visitor Approved' : 'Visitor Rejected',
          description: result.message
        });
        setLocation('/resident');
      } else {
        throw new Error(result.error || 'Failed to process decision');
      }
    } catch (err) {
      console.error('Error processing decision:', err);
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive'
      });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Invalid Request</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => setLocation('/resident')}>
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!visitorData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <p>Visitor data not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <User className="h-5 w-5" />
            Visitor Approval Request
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{visitorData.visitorName}</span>
            </div>
            
            {visitorData.visitorPhone && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">📞 {visitorData.visitorPhone}</span>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{visitorData.blockName} {visitorData.flatNumber}</span>
            </div>
            
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{visitorData.purpose}</span>
            </div>
          </div>

          <div className="pt-4 space-y-3">
            <Button
              onClick={() => handleDecision('approve')}
              disabled={processing}
              className="w-full bg-green-600 hover:bg-green-700"
              size="lg"
            >
              {processing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Approve Visitor
            </Button>
            
            <Button
              onClick={() => handleDecision('reject')}
              disabled={processing}
              variant="destructive"
              className="w-full"
              size="lg"
            >
              {processing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Reject Visitor
            </Button>
          </div>

          <div className="pt-2 text-center">
            <Button
              variant="ghost"
              onClick={() => setLocation('/resident')}
              disabled={processing}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}