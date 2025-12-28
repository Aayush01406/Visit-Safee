import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertVisitorRequestSchema } from "@/lib/types";
import { useBlocks, useFlats, useResidencyByName } from "@/hooks/use-society";
import { useCreatePublicVisitorRequest } from "@/hooks/use-visitor-requests";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldCheck, Loader2 } from "lucide-react";

export default function VisitorForm({ residencyName }) {
  const residencyNameParam = residencyName ? decodeURIComponent(residencyName) : undefined;
  
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedBlock, setSelectedBlock] = useState(null);

  // 1. Resolve Residency Name to ID
  const { data: residency, isLoading: residencyLoading, isError: residencyError } = useResidencyByName(residencyNameParam);
  
  // 2. Fetch Blocks and Flats using Residency ID
  const { data: blocks } = useBlocks(residency?.id);
  const { data: flats, isLoading: flatsLoading } = useFlats(selectedBlock ?? undefined, residency?.id);
  
  const { mutateAsync: createRequest, isPending } = useCreatePublicVisitorRequest();

  useEffect(() => {
    if (residency?.name) {
      document.title = `${residency.name} Visitor Form`;
    }
  }, [residency?.name]);

  const form = useForm({
    resolver: zodResolver(insertVisitorRequestSchema),
    defaultValues: {
      visitorName: "",
      visitorPhone: "",
      flatId: "",
      purpose: "",
      vehicleNumber: "",
    },
  });

  const onSubmit = async (data) => {
    if (!residency?.id) {
        toast({ title: "Error", description: "Residency not found", variant: "destructive" });
        return;
    }

    try {
      const requestId = await createRequest({ data, residencyId: residency.id, residencyName: residency.name });
      toast({ title: "Request Sent", description: "Waiting for resident approval." });
      setLocation(`/visitor-success?id=${requestId}&residencyId=${residency.id}`);
    } catch (err) {
      console.error("Error submitting form: ", err);
      toast({ title: "Error", description: err.message || "There was an error submitting the form", variant: "destructive" });
    }
  };

  if (residencyLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
  }

  if (residencyError || !residency) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50">
            <Card className="max-w-md w-full p-6 text-center">
                <h2 className="text-xl font-bold text-destructive mb-2">Residency Not Found</h2>
                <p className="text-muted-foreground">The society you are looking for does not exist or the link is incorrect.</p>
            </Card>
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary text-primary-foreground mb-4 shadow-xl shadow-primary/30">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-display font-bold text-slate-900">SecureEntry</h1>
          <h3 className="text-xl font-semibold text-slate-700 mt-2">
            {residency.name} Visitor Form
          </h3>
          <p className="text-slate-500 mt-2">Visitor Entry Management System</p>
        </div>

        <Card className="border-t-4 border-t-primary shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl">New Visitor Entry</CardTitle>
            <CardDescription>Enter your details to request access.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="visitorName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="visitorPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input placeholder="9876543210" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormItem>
                    <FormLabel>Block</FormLabel>
                    <Select onValueChange={(val) => setSelectedBlock(val)}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Block" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {blocks?.map((block) => (
                          <SelectItem key={block.id} value={String(block.id)}>
                            {block.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>

                  <FormField
                    control={form.control}
                    name="flatId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Flat</FormLabel>
                        <Select 
                          disabled={!selectedBlock} 
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={flatsLoading ? "Loading..." : "Select Flat"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {flats?.map((flat) => (
                              <SelectItem key={flat.id} value={String(flat.id)}>
                                {flat.number}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="purpose"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Purpose of Visit</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Delivery, Meeting, etc." className="resize-none" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="vehicleNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vehicle Number (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="XX-00-XX-0000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit Request"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
