import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, CheckCircle, Clock, UserPlus, Shield, ArrowLeft, Webhook, Users, BarChart3, Mail, Activity, TrendingUp, ShieldCheck, User, RefreshCw } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemeToggle } from "@/components/theme-toggle";
import remoteLeverageLogo from "@assets/Featured-Image_1765552083832.png";

interface ApprovedEmail {
  id: string;
  email: string;
  role: string;
  addedAt: string;
  hasAccount: boolean;
}

interface User {
  id: string;
  email: string;
  displayName: string | null;
  profilePicture: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  loginCount: number;
  createdAt: string;
}

interface Analytics {
  totalUsers: number;
  activeUsers: number;
  pendingInvites: number;
  activeInLast7Days: number;
  activeInLast30Days: number;
  totalLogins: number;
  roles: {
    admin: number;
    standard: number;
  };
  recentUsers: { displayName: string | null; email: string; createdAt: string }[];
}

export default function AdminUsers() {
  const { toast } = useToast();
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"standard" | "admin">("standard");
  const [isAdding, setIsAdding] = useState(false);
  const [isRegisteringWebhook, setIsRegisteringWebhook] = useState(false);
  const [isFullSyncing, setIsFullSyncing] = useState(false);

  const { data: approvedEmails = [], isLoading: loadingEmails } = useQuery<ApprovedEmail[]>({
    queryKey: ["/api/admin/approved-emails"],
  });

  const { data: users = [], isLoading: loadingUsers } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: analytics, isLoading: loadingAnalytics } = useQuery<Analytics>({
    queryKey: ["/api/admin/users/analytics"],
  });

  const addEmailMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      return apiRequest("POST", "/api/admin/approved-emails", { email, role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/approved-emails"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/analytics"] });
      setNewEmail("");
      setNewRole("standard");
      toast({
        title: "Email approved",
        description: "The user can now sign in with Google SSO.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add email",
        description: error?.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const removeEmailMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/approved-emails/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/approved-emails"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/analytics"] });
      toast({
        title: "Email removed",
        description: "The email has been removed from the approved list.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to remove email",
        description: error?.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    
    setIsAdding(true);
    try {
      await addEmailMutation.mutateAsync({ email: newEmail.trim().toLowerCase(), role: newRole });
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveEmail = async (id: string) => {
    await removeEmailMutation.mutateAsync(id);
  };

  const handleRegisterWebhook = async () => {
    setIsRegisteringWebhook(true);
    try {
      const response = await fetch("/api/recruitcrm/register-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || data.details || "Failed to register webhook");
      }
      
      toast({
        title: "Webhook registered",
        description: data.message || "Successfully registered candidate stage webhook with RecruitCRM",
      });
    } catch (error: any) {
      toast({
        title: "Failed to register webhook",
        description: error?.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsRegisteringWebhook(false);
    }
  };

  const handleFullSync = async () => {
    setIsFullSyncing(true);
    try {
      const response = await fetch("/api/admin/full-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to run full sync");
      }
      
      toast({
        title: "Full sync completed",
        description: data.message || "All data has been synchronized",
      });
    } catch (error: any) {
      toast({
        title: "Full sync failed",
        description: error?.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsFullSyncing(false);
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return "Never";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatRelativeTime = (date: string | null) => {
    if (!date) return "Never";
    const now = new Date();
    const then = new Date(date);
    const diff = now.getTime() - then.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return formatDate(date);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <img 
              src={remoteLeverageLogo} 
              alt="Remote Leverage" 
              className="h-10 w-10 rounded-lg object-cover"
            />
            <div>
              <h1 className="text-lg font-semibold">User Management</h1>
              <p className="text-xs text-muted-foreground">Admin Settings</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard-home">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container px-4 py-6 max-w-6xl mx-auto">
        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Webhook className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5" />
                  Invite New User
                </CardTitle>
                <CardDescription>
                  Add an email to allow a user to sign in with Google SSO
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddEmail} className="flex gap-3">
                  <div className="flex-1">
                    <Label htmlFor="email" className="sr-only">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="user@remoteleverage.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                  </div>
                  <Select value={newRole} onValueChange={(value: "standard" | "admin") => setNewRole(value)}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Member
                        </div>
                      </SelectItem>
                      <SelectItem value="admin">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4" />
                          Admin
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button 
                    type="submit" 
                    disabled={isAdding || !newEmail.trim()}
                  >
                    {isAdding ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        Invite
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      Active Users ({users.filter(u => u.isActive).length})
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingUsers ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : users.filter(u => u.isActive).length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">
                      No active users yet.
                    </p>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {users.filter(u => u.isActive).map((user) => (
                        <div 
                          key={user.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={user.profilePicture || undefined} />
                              <AvatarFallback className="text-xs">
                                {(user.displayName || user.email).slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm">{user.displayName || user.email.split("@")[0]}</p>
                              <p className="text-xs text-muted-foreground">{user.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                              {user.role}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(user.lastLoginAt)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-yellow-500" />
                    Pending Invites ({approvedEmails.filter(e => !e.hasAccount).length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingEmails ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : approvedEmails.filter(e => !e.hasAccount).length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">
                      No pending invites.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {approvedEmails.filter(e => !e.hasAccount).map((email) => (
                        <div 
                          key={email.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                              <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{email.email}</p>
                              <p className="text-xs text-muted-foreground">
                                Invited {formatDate(email.addedAt)}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveEmail(email.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            {loadingAnalytics ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : analytics ? (
              <>
                <div className="grid gap-4 md:grid-cols-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Users</p>
                          <p className="text-3xl font-bold">{analytics.totalUsers}</p>
                        </div>
                        <Users className="h-8 w-8 text-primary/50" />
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Active (7 days)</p>
                          <p className="text-3xl font-bold">{analytics.activeInLast7Days}</p>
                        </div>
                        <Activity className="h-8 w-8 text-green-500/50" />
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Pending Invites</p>
                          <p className="text-3xl font-bold">{analytics.pendingInvites}</p>
                        </div>
                        <Mail className="h-8 w-8 text-yellow-500/50" />
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Logins</p>
                          <p className="text-3xl font-bold">{analytics.totalLogins}</p>
                        </div>
                        <TrendingUp className="h-8 w-8 text-blue-500/50" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>User Roles</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-primary" />
                            Admins
                          </span>
                          <Badge>{analytics.roles.admin}</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            Standard Users
                          </span>
                          <Badge variant="secondary">{analytics.roles.standard}</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Recent Sign-ups</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {analytics.recentUsers.length === 0 ? (
                        <p className="text-muted-foreground text-center py-4">No recent sign-ups</p>
                      ) : (
                        <div className="space-y-3">
                          {analytics.recentUsers.map((user, idx) => (
                            <div key={idx} className="flex items-center justify-between">
                              <span className="text-sm">{user.displayName || user.email.split("@")[0]}</span>
                              <span className="text-xs text-muted-foreground">{formatDate(user.createdAt)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              <p className="text-center text-muted-foreground py-12">Failed to load analytics</p>
            )}
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Webhook className="h-5 w-5" />
                  RecruitCRM Integration
                </CardTitle>
                <CardDescription>
                  Register webhooks for automatic candidate stage synchronization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Click the button below to register a webhook with RecruitCRM. This will automatically 
                    sync candidates when their stage changes.
                  </p>
                  <Button 
                    onClick={handleRegisterWebhook}
                    disabled={isRegisteringWebhook}
                  >
                    {isRegisteringWebhook ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Registering...
                      </>
                    ) : (
                      <>
                        <Webhook className="mr-2 h-4 w-4" />
                        Register Candidate Stage Webhook
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5" />
                  Full System Sync
                </CardTitle>
                <CardDescription>
                  Manually trigger a complete synchronization of all data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    This will sync all data from Calendly, RecruitCRM, and Google Calendar. 
                    It will also create missing VA interviews and populate attendees.
                  </p>
                  <Button 
                    onClick={handleFullSync}
                    disabled={isFullSyncing}
                  >
                    {isFullSyncing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Run Full Sync
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
