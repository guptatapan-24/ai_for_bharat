import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { UserRoleProvider } from "@/contexts/UserRoleContext";
import AdminUsers from "@/pages/admin/users";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import CaseList from "@/pages/cases/index";
import NewCase from "@/pages/cases/new";
import CaseDetail from "@/pages/cases/detail";
import CaseVerify from "@/pages/cases/verify";

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined
  ?? publishableKeyFromHost(window.location.hostname, undefined);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL || undefined;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: "bottom" as const,
    socialButtonsVariant: "blockButton" as const,
  },
  variables: {
    colorPrimary: "hsl(38, 92%, 50%)",
    colorForeground: "hsl(222, 47%, 11%)",
    colorMutedForeground: "hsl(215, 16%, 47%)",
    colorDanger: "hsl(0, 84%, 60%)",
    colorBackground: "hsl(0, 0%, 100%)",
    colorInput: "hsl(214, 32%, 91%)",
    colorInputForeground: "hsl(222, 47%, 11%)",
    colorNeutral: "hsl(214, 32%, 91%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.375rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-xl w-[440px] max-w-full overflow-hidden shadow-xl border border-slate-200",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-slate-900 font-semibold text-xl",
    headerSubtitle: "text-slate-500 text-sm",
    socialButtonsBlockButtonText: "text-slate-700 font-medium",
    formFieldLabel: "text-slate-700 text-sm font-medium",
    footerActionLink: "text-amber-600 font-medium hover:text-amber-700",
    footerActionText: "text-slate-500",
    dividerText: "text-slate-400 text-xs",
    identityPreviewEditButton: "text-amber-600",
    formFieldSuccessText: "text-green-600",
    alertText: "text-red-700",
    logoBox: "mb-1",
    logoImage: "h-10 w-auto",
    socialButtonsBlockButton: "border-slate-200 hover:bg-slate-50 text-slate-700",
    formButtonPrimary: "bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-none",
    formFieldInput: "border-slate-200 bg-white text-slate-900",
    footerAction: "bg-slate-50 border-t border-slate-100",
    dividerLine: "bg-slate-200",
    alert: "bg-red-50 border border-red-200 rounded-md",
    otpCodeFieldInput: "border-slate-200",
    formFieldRow: "",
    main: "px-1",
  },
};

function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <div className="hidden md:flex md:w-2/5 bg-[hsl(222,47%,11%)] flex-col justify-between p-10">
        <div>
          <div className="flex items-center gap-3 mb-10">
            <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center">
              <span className="text-[hsl(222,47%,11%)] font-bold font-serif text-lg">V</span>
            </div>
            <span className="text-white font-serif font-bold text-2xl tracking-tight">VerdictIQ</span>
          </div>
          <h2 className="text-white text-3xl font-serif font-bold leading-tight mb-4">
            Court judgment intelligence for Indian governance
          </h2>
          <p className="text-slate-400 text-base leading-relaxed">
            Ingest judgment PDFs, extract compliance directives with AI, and track action plans — all in one place.
          </p>
        </div>
        <div className="space-y-4">
          {[
            "AI-powered directive extraction",
            "Human-in-the-loop verification",
            "Department-level action tracking",
          ].map((feature) => (
            <div key={feature} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
              </div>
              <span className="text-slate-300 text-sm">{feature}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center bg-slate-50 px-4 py-12">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-8 md:hidden">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
              <span className="text-[hsl(222,47%,11%)] font-bold font-serif">V</span>
            </div>
            <span className="text-slate-900 font-serif font-bold text-xl">VerdictIQ</span>
          </div>
          <SignIn
            routing="path"
            path={`${basePath}/sign-in`}
            signUpUrl={`${basePath}/sign-up`}
            appearance={clerkAppearance}
          />
        </div>
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <div className="hidden md:flex md:w-2/5 bg-[hsl(222,47%,11%)] flex-col justify-between p-10">
        <div>
          <div className="flex items-center gap-3 mb-10">
            <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center">
              <span className="text-[hsl(222,47%,11%)] font-bold font-serif text-lg">V</span>
            </div>
            <span className="text-white font-serif font-bold text-2xl tracking-tight">VerdictIQ</span>
          </div>
          <h2 className="text-white text-3xl font-serif font-bold leading-tight mb-4">
            Join your team on VerdictIQ
          </h2>
          <p className="text-slate-400 text-base leading-relaxed">
            Create an account to start managing court compliance directives for your department.
          </p>
        </div>
        <div className="space-y-4">
          {[
            "AI-powered directive extraction",
            "Human-in-the-loop verification",
            "Department-level action tracking",
          ].map((feature) => (
            <div key={feature} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
              </div>
              <span className="text-slate-300 text-sm">{feature}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center bg-slate-50 px-4 py-12">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-8 md:hidden">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
              <span className="text-[hsl(222,47%,11%)] font-bold font-serif">V</span>
            </div>
            <span className="text-slate-900 font-serif font-bold text-xl">VerdictIQ</span>
          </div>
          <SignUp
            routing="path"
            path={`${basePath}/sign-up`}
            signInUrl={`${basePath}/sign-in`}
            appearance={clerkAppearance}
          />
        </div>
      </div>
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function ProtectedRoutes() {
  return (
    <>
      <Show when="signed-in">
        <UserRoleProvider>
          <AppLayout>
            <Switch>
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/cases" component={CaseList} />
              <Route path="/cases/new" component={NewCase} />
              <Route path="/cases/:id" component={CaseDetail} />
              <Route path="/cases/:id/verify" component={CaseVerify} />
              <Route path="/admin/users" component={AdminUsers} />
              <Route component={NotFound} />
            </Switch>
          </AppLayout>
        </UserRoleProvider>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Sign in to VerdictIQ",
            subtitle: "Access your court compliance dashboard",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Get started with VerdictIQ",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route component={ProtectedRoutes} />
          </Switch>
        </TooltipProvider>
        <Toaster />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
