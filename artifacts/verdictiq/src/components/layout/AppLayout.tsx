import { Link, useLocation } from "wouter";
import { LayoutDashboard, FileText, PlusCircle, LogOut, ChevronUp } from "lucide-react";
import { useUser, useClerk } from "@clerk/react";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarFooter } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

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
                <SidebarMenuButton asChild isActive={location === "/dashboard"}>
                  <Link href="/dashboard">
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
          <SidebarFooter className="p-2 border-t border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-sidebar-accent text-sidebar-foreground transition-colors text-left">
                  <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-sidebar font-semibold text-sm flex-shrink-0">
                    {user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-sidebar-foreground">
                      {user?.fullName ?? user?.emailAddresses?.[0]?.emailAddress ?? "User"}
                    </p>
                    <p className="text-xs text-sidebar-foreground/60 truncate">
                      {user?.emailAddresses?.[0]?.emailAddress ?? ""}
                    </p>
                  </div>
                  <ChevronUp className="h-4 w-4 text-sidebar-foreground/60 flex-shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user?.fullName ?? "User"}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.emailAddresses?.[0]?.emailAddress}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive cursor-pointer"
                  onClick={() => signOut({ redirectUrl: basePath || "/" })}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <main className="flex-1 overflow-y-auto bg-background text-foreground flex flex-col">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
