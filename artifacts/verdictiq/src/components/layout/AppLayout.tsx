import { Link, useLocation } from "wouter";
import { LayoutDashboard, FileText, PlusCircle } from "lucide-react";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from "@/components/ui/sidebar";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden w-full">
        <Sidebar className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
          <SidebarHeader className="p-4 border-b border-sidebar-border">
            <h1 className="text-xl font-serif font-bold text-amber-500 tracking-tight flex items-center gap-2">
              <div className="w-6 h-6 bg-amber-500 rounded flex items-center justify-center text-sidebar font-sans text-xs">V</div>
              VerdictIQ
            </h1>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu className="mt-4 px-2 gap-2">
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/"}>
                  <Link href="/">
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    Dashboard
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/cases") && location !== "/cases/new"}>
                  <Link href="/cases">
                    <FileText className="mr-2 h-4 w-4" />
                    Cases
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/cases/new"}>
                  <Link href="/cases/new">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    New Case
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
        <main className="flex-1 overflow-y-auto bg-background text-foreground flex flex-col">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}