import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useCreateCase } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "wouter";

const caseSchema = z.object({
  caseNumber: z.string().min(1, "Case number is required"),
  court: z.string().min(1, "Court name is required"),
  bench: z.string().optional(),
  benchType: z.enum(["single", "division", "coordinate", "full_bench"]).optional(),
  dateOfOrder: z.string().optional(),
  petitioner: z.string().optional(),
  respondent: z.string().optional(),
  governmentRole: z.enum(["petitioner", "respondent", "both", "none"]).optional(),
  urgencyLevel: z.enum(["critical", "high", "medium", "low"]).optional(),
  notes: z.string().optional()
});

type CaseFormValues = z.infer<typeof caseSchema>;

export default function NewCase() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createCase = useCreateCase();

  const form = useForm<CaseFormValues>({
    resolver: zodResolver(caseSchema),
    defaultValues: {
      caseNumber: "",
      court: "High Court",
      benchType: "single",
      governmentRole: "none",
      urgencyLevel: "medium",
    },
  });

  const onSubmit = (data: CaseFormValues) => {
    createCase.mutate({ data }, {
      onSuccess: (newCase) => {
        toast({
          title: "Case registered",
          description: `Case ${newCase.caseNumber} has been created successfully.`,
        });
        setLocation(`/cases/${newCase.id}`);
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to register the case. Please try again.",
        });
      }
    });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto w-full space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/cases">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Cases
          </Link>
        </Button>
        <h1 className="text-3xl font-serif font-bold text-foreground">Register New Case</h1>
        <p className="text-muted-foreground mt-1">Enter the preliminary details before uploading the judgment PDF for extraction.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Case Information</CardTitle>
          <CardDescription>All fields are required unless marked optional.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="caseNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Case Number / Citation</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. WP(C) 1234/2023" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="court"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Court</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. High Court of Delhi" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dateOfOrder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date of Order</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="urgencyLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Urgency Level</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select urgency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="petitioner"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Petitioner (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Name of petitioner" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="respondent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Respondent (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Name of respondent" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="governmentRole"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Government Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="petitioner">Petitioner</SelectItem>
                          <SelectItem value="respondent">Respondent</SelectItem>
                          <SelectItem value="both">Both</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="benchType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bench Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select bench type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="single">Single Judge</SelectItem>
                          <SelectItem value="division">Division Bench</SelectItem>
                          <SelectItem value="coordinate">Coordinate Bench</SelectItem>
                          <SelectItem value="full_bench">Full Bench</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Any preliminary context or filing notes..." className="resize-y" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end pt-4 border-t">
                <Button type="button" variant="outline" className="mr-4" asChild>
                  <Link href="/cases">Cancel</Link>
                </Button>
                <Button type="submit" disabled={createCase.isPending}>
                  {createCase.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Register Case & Proceed
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}