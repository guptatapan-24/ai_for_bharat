import { useGetDashboardSummary, useGetUrgentItems, useGetDepartmentWorkload, useGetRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Clock, FileText, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary();
  const { data: urgentItems, isLoading: isUrgentLoading } = useGetUrgentItems();
  const { data: workload, isLoading: isWorkloadLoading } = useGetDepartmentWorkload();
  const { data: activities, isLoading: isActivityLoading } = useGetRecentActivity();

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Command Center</h1>
        <p className="text-muted-foreground mt-1">System-wide overview of pending directives and action items.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardDescription>Total Cases</CardDescription>
            <CardTitle className="text-3xl flex items-center justify-between">
              {isSummaryLoading ? <Skeleton className="h-8 w-16" /> : summary?.totalCases || 0}
              <FileText className="h-5 w-5 text-blue-500 opacity-50" />
            </CardTitle>
          </CardHeader>
        </Card>
        
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-2">
            <CardDescription>Pending Verification</CardDescription>
            <CardTitle className="text-3xl flex items-center justify-between">
              {isSummaryLoading ? <Skeleton className="h-8 w-16" /> : summary?.pendingVerifications || 0}
              <Clock className="h-5 w-5 text-amber-500 opacity-50" />
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="pb-2">
            <CardDescription>Overdue Items</CardDescription>
            <CardTitle className="text-3xl flex items-center justify-between">
              {isSummaryLoading ? <Skeleton className="h-8 w-16" /> : summary?.overdueItems || 0}
              <AlertTriangle className="h-5 w-5 text-red-500 opacity-50" />
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardDescription>Cases Verified</CardDescription>
            <CardTitle className="text-3xl flex items-center justify-between">
              {isSummaryLoading ? <Skeleton className="h-8 w-16" /> : summary?.casesVerified || 0}
              <CheckCircle2 className="h-5 w-5 text-emerald-500 opacity-50" />
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Urgent Action Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isUrgentLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : urgentItems && urgentItems.length > 0 ? (
                <div className="space-y-4">
                  {urgentItems.map(item => (
                    <div key={item.actionItemId} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-md gap-4 bg-muted/20">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Link href={`/cases/${item.caseId}`} className="text-sm font-medium text-primary hover:underline">
                            {item.caseNumber}
                          </Link>
                          <Badge variant={item.priority === "critical" ? "destructive" : "default"}>
                            {item.priority}
                          </Badge>
                          {item.isOverdue && <Badge variant="destructive" className="bg-red-600">Overdue</Badge>}
                        </div>
                        <h4 className="text-sm font-semibold">{item.title}</h4>
                        <p className="text-xs text-muted-foreground mt-1">Due: {new Date(item.deadline).toLocaleDateString()} ({item.daysRemaining} days)</p>
                      </div>
                      <div className="flex-shrink-0">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/cases/${item.caseId}`}>View Case</Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground border-2 border-dashed rounded-md">
                  No urgent items. You're all caught up.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Department Workload</CardTitle>
            </CardHeader>
            <CardContent>
              {isWorkloadLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : workload && workload.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Department</th>
                        <th className="px-4 py-3 font-medium text-right">Total</th>
                        <th className="px-4 py-3 font-medium text-right">Pending</th>
                        <th className="px-4 py-3 font-medium text-right">Completed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {workload.map(dept => (
                        <tr key={dept.department}>
                          <td className="px-4 py-3 font-medium">{dept.department}</td>
                          <td className="px-4 py-3 text-right">{dept.totalItems}</td>
                          <td className="px-4 py-3 text-right text-amber-600 font-medium">{dept.pendingItems}</td>
                          <td className="px-4 py-3 text-right text-emerald-600">{dept.completedItems}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  No workload data available.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isActivityLoading ? (
                <div className="space-y-6">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : activities && activities.length > 0 ? (
                <div className="relative border-l border-muted ml-3 space-y-6">
                  {activities.map(activity => (
                    <div key={activity.id} className="pl-6 relative">
                      <div className="absolute w-3 h-3 bg-primary rounded-full -left-[6.5px] top-1.5 outline outline-4 outline-card" />
                      <div className="text-sm font-medium mb-1">
                        <Link href={`/cases/${activity.caseId}`} className="hover:underline text-primary">
                          {activity.caseNumber}
                        </Link>
                      </div>
                      <p className="text-sm text-muted-foreground">{activity.description}</p>
                      <div className="text-xs text-muted-foreground mt-2 opacity-70">
                        {new Date(activity.timestamp).toLocaleString()}
                        {activity.reviewer && ` by ${activity.reviewer}`}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  No recent activity.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}