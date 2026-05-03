import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-8 text-center space-y-6">
      <ShieldAlert className="w-16 h-16 text-muted-foreground opacity-50" />
      <div>
        <h1 className="text-4xl font-serif font-bold text-foreground">404</h1>
        <p className="text-xl text-muted-foreground mt-2 font-medium">Record Not Found</p>
      </div>
      <p className="text-muted-foreground max-w-md mx-auto">
        The judgment, directive, or action item you are looking for does not exist in the system, or you do not have permission to access it.
      </p>
      <Button asChild className="mt-4 bg-primary text-primary-foreground">
        <Link href="/">Return to Command Center</Link>
      </Button>
    </div>
  );
}