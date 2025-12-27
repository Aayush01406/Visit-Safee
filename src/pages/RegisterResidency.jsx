import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Building2, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { storage } from "@/lib/storage";
import { registerResidencySchema } from "@/lib/types";

export default function RegisterResidency() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const form = useForm({
    resolver: zodResolver(registerResidencySchema),
    defaultValues: {
      residencyName: "",
      adminUsername: "",
      adminPassword: "",
      adminPhone: "",
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data) => {
      return await storage.registerResidency(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["residencies"] });
      toast({
        title: "Residency Registered",
        description: "Your society has been created successfully. Please login.",
      });
      setLocation("/login");
    },
    onError: (error) => {
      toast({
        title: "Registration Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data) => {
    registerMutation.mutate(data);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left: Branding */}
      <div className="hidden lg:flex flex-col justify-between bg-primary p-12 text-primary-foreground relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1600&h=1600&fit=crop')] opacity-10 bg-cover bg-center" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-primary/90" />
        
        <div className="relative z-10">
          <Link href="/login" className="flex items-center gap-2 text-primary-foreground/80 hover:text-white transition-colors mb-8">
            <ArrowLeft className="h-4 w-4" />
            Back to Login
          </Link>
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-8 w-8" />
            <span className="font-display font-bold text-2xl">Register Society</span>
          </div>
          <p className="text-primary-foreground/80">Create a new secure environment for your residency.</p>
        </div>

        <div className="relative z-10">
          <blockquote className="space-y-2">
            <p className="text-xl font-display font-medium leading-relaxed">
              "Manage residents, guards, and visitors with a dedicated workspace for your society."
            </p>
          </blockquote>
        </div>
      </div>

      {/* Right: Form */}
      <div className="flex items-center justify-center p-8 bg-slate-50">
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full max-w-sm space-y-6"
        >
          <div className="text-center lg:text-left">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Register New Residency</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Set up your society and admin account.
            </p>
          </div>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="residencyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Residency Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Royal Heights" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="adminUsername"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Admin Username</FormLabel>
                        <FormControl>
                          <Input placeholder="admin_username" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="adminPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Admin Password</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="adminPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="+91..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                    {registerMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Register Residency"
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
          
          <div className="text-center text-sm">
            <Link href="/login" className="text-primary hover:underline">
              Already have an account? Sign in
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
