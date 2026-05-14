import { useState, useEffect } from "react";
import { Bell, Mail, Zap, Building2, Save, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const DEPARTMENT_LIST = [
  { name: "Ministry of Home Affairs", category: "central" },
  { name: "Ministry of Finance", category: "central" },
  { name: "Ministry of Law & Justice", category: "central" },
  { name: "Ministry of Health & Family Welfare", category: "central" },
  { name: "Ministry of Education", category: "central" },
  { name: "Ministry of Environment, Forest & Climate Change", category: "central" },
  { name: "Ministry of Agriculture & Farmers Welfare", category: "central" },
  { name: "Ministry of Defence", category: "central" },
  { name: "Ministry of External Affairs", category: "central" },
  { name: "Ministry of Commerce & Industry", category: "central" },
  { name: "Ministry of Labour & Employment", category: "central" },
  { name: "Ministry of Social Justice & Empowerment", category: "central" },
  { name: "Ministry of Women & Child Development", category: "central" },
  { name: "Ministry of Housing & Urban Affairs", category: "central" },
  { name: "Ministry of Rural Development", category: "central" },
  { name: "Ministry of Power", category: "central" },
  { name: "Ministry of Railways", category: "central" },
  { name: "Ministry of Road Transport & Highways", category: "central" },
  { name: "Ministry of Tribal Affairs", category: "central" },
  { name: "Ministry of Information & Broadcasting", category: "central" },
  { name: "Ministry of Petroleum & Natural Gas", category: "central" },
  { name: "Revenue Department (State)", category: "state" },
  { name: "Police Department (State)", category: "state" },
  { name: "Public Works Department (State)", category: "state" },
  { name: "Forest Department (State)", category: "state" },
  { name: "Municipal Corporation / Urban Local Body", category: "state" },
  { name: "District Administration", category: "state" },
  { name: "State Health Department", category: "state" },
  { name: "State Education Department", category: "state" },
  { name: "State Finance Department", category: "state" },
  { name: "State Agriculture Department", category: "state" },
  { name: "State Home Department", category: "state" },
  { name: "Central Bureau of Investigation", category: "enforcement" },
  { name: "Enforcement Directorate", category: "enforcement" },
  { name: "Income Tax Department", category: "enforcement" },
  { name: "Customs & Central Excise", category: "enforcement" },
  { name: "High Court Registry", category: "enforcement" },
  { name: "Other / Not Specified", category: "other" },
] as const;

interface Preferences {
  emailEnabled: boolean;
  inAppEnabled: boolean;
  urgentOnly: boolean;
  departmentSubscriptions: string[];
}

export default function NotificationPreferencesPage() {
  const [prefs, setPrefs] = useState<Preferences>({
    emailEnabled: true,
    inAppEnabled: true,
    urgentOnly: false,
    departmentSubscriptions: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/notifications/preferences", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setPrefs({
          emailEnabled: data.emailEnabled,
          inAppEnabled: data.inAppEnabled,
          urgentOnly: data.urgentOnly,
          departmentSubscriptions: Array.isArray(data.departmentSubscriptions) ? data.departmentSubscriptions : [],
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (res.ok) {
        toast({ title: "Preferences saved", description: "Your notification preferences have been updated." });
      } else {
        throw new Error("Failed to save");
      }
    } catch {
      toast({ title: "Error", description: "Failed to save preferences.", variant: "destructive" });
    }
    setSaving(false);
  };

  const toggleDept = (name: string) => {
    setPrefs((p) => ({
      ...p,
      departmentSubscriptions: p.departmentSubscriptions.includes(name)
        ? p.departmentSubscriptions.filter((d) => d !== name)
        : [...p.departmentSubscriptions, name],
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  const grouped = DEPARTMENT_LIST.reduce((acc, dept) => {
    if (!acc[dept.category]) acc[dept.category] = [];
    acc[dept.category].push(dept.name);
    return acc;
  }, {} as Record<string, string[]>);

  const categoryLabels: Record<string, string> = {
    central: "Central Government",
    state: "State Government",
    enforcement: "Enforcement & Judiciary",
    other: "Other",
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/notifications">
            <button className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>
          </Link>
          <h1 className="text-xl font-semibold text-foreground">Notification Preferences</h1>
        </div>
        <p className="text-sm text-muted-foreground ml-7">Control how and when you receive notifications.</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 max-w-2xl">

        {/* Delivery Channels */}
        <section>
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-500" /> Delivery Channels
          </h2>
          <div className="space-y-4 bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="inApp" className="text-sm font-medium">In-app notifications</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Bell icon and notification center in the sidebar</p>
              </div>
              <Switch
                id="inApp"
                checked={prefs.inAppEnabled}
                onCheckedChange={(v) => setPrefs((p) => ({ ...p, inAppEnabled: v }))}
              />
            </div>
            <div className="border-t border-border" />
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-2">
                <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <Label htmlFor="email" className="text-sm font-medium">Email notifications</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Receive emails for important events</p>
                </div>
              </div>
              <Switch
                id="email"
                checked={prefs.emailEnabled}
                onCheckedChange={(v) => setPrefs((p) => ({ ...p, emailEnabled: v }))}
              />
            </div>
          </div>
        </section>

        {/* Urgency Filter */}
        <section>
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" /> Urgency Filter
          </h2>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="urgentOnly" className="text-sm font-medium">Critical & High priority only</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Skip medium and low priority notifications</p>
              </div>
              <Switch
                id="urgentOnly"
                checked={prefs.urgentOnly}
                onCheckedChange={(v) => setPrefs((p) => ({ ...p, urgentOnly: v }))}
              />
            </div>
            {prefs.urgentOnly && (
              <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-xs text-amber-700">You will only receive <strong>critical</strong> and <strong>high</strong> priority notifications.</p>
              </div>
            )}
          </div>
        </section>

        {/* Department Subscriptions */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide flex items-center gap-2">
              <Building2 className="h-4 w-4 text-amber-500" /> Department Subscriptions
            </h2>
            {prefs.departmentSubscriptions.length > 0 && (
              <Badge className="text-xs bg-amber-100 text-amber-700 border-0">
                {prefs.departmentSubscriptions.length} selected
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-4">Select departments to receive targeted notifications. Leave empty to receive all.</p>

          <div className="space-y-6">
            {Object.entries(grouped).map(([cat, depts]) => (
              <div key={cat}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{categoryLabels[cat] ?? cat}</p>
                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                  {depts.map((dept) => (
                    <div key={dept} className="flex items-center gap-3">
                      <Checkbox
                        id={dept}
                        checked={prefs.departmentSubscriptions.includes(dept)}
                        onCheckedChange={() => toggleDept(dept)}
                      />
                      <Label htmlFor={dept} className="text-sm font-normal cursor-pointer">{dept}</Label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Save */}
        <div className="pb-8">
          <Button onClick={save} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-white font-semibold gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Preferences"}
          </Button>
        </div>
      </div>
    </div>
  );
}
