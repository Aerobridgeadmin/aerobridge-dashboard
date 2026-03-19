import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/components/theme-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, Sun, Moon, Monitor, Calendar, Settings, User, Bell, Shield, Users, Mail, MessageCircle, FileText, Pencil, Loader2, Copy, Check, Info, ChevronDown, Database, RefreshCw, Code, Download, Megaphone } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface HriqActions {
  onExportCSV?: () => void;
  onAnnounce?: () => void;
}

interface UserAvatarMenuProps {
  className?: string;
  onSettingsClick?: () => void;
  hriqActions?: HriqActions;
}

interface EmailTemplate {
  id: string;
  name: string;
  label: string;
  subject: string;
  body: string;
  description: string | null;
  isDefault: boolean | null;
}

interface WhatsAppTemplate {
  id: number;
  name: string;
  preview: string;
  message: string;
  isDoubleMessage: boolean;
}

export function UserAvatarMenu({ className, onSettingsClick, hriqActions }: UserAvatarMenuProps) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [whatsappNotifications, setWhatsappNotifications] = useState(true);
  const [editingEmailTemplate, setEditingEmailTemplate] = useState<EmailTemplate | null>(null);
  const [emailFormData, setEmailFormData] = useState({ name: "", label: "", subject: "", body: "", description: "" });
  const [copiedPlaceholder, setCopiedPlaceholder] = useState<string | null>(null);

  const displayName = user?.displayName || user?.email?.split('@')[0]?.split('.').map(
    (part: string) => part.charAt(0).toUpperCase() + part.slice(1)
  ).join(' ') || "User";

  const userInitials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const isAdmin = user?.role === "admin";

  const { data: emailTemplates, isLoading: loadingEmailTemplates } = useQuery<EmailTemplate[]>({
    queryKey: ["email-templates"],
    queryFn: async () => {
      const res = await fetch("/api/email-templates");
      return res.json();
    },
    enabled: settingsOpen,
  });

  const { data: whatsappTemplates, isLoading: loadingWhatsappTemplates } = useQuery<WhatsAppTemplate[]>({
    queryKey: ["whatsapp-templates"],
    queryFn: async () => {
      const res = await fetch("/api/whatsapp/templates");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: settingsOpen,
  });

  const seedDefaultsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/email-templates/seed-defaults", { method: "POST" });
      if (!res.ok) throw new Error("Failed to seed defaults");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      toast({ title: "Default templates created" });
    },
  });

  const updateEmailTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof emailFormData }) => {
      const res = await fetch(`/api/email-templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update template");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      setEditingEmailTemplate(null);
      toast({ title: "Template updated" });
    },
  });

  const openEditEmailDialog = (template: EmailTemplate) => {
    setEditingEmailTemplate(template);
    setEmailFormData({
      name: template.name,
      label: template.label,
      subject: template.subject,
      body: template.body,
      description: template.description || "",
    });
  };

  const copyPlaceholder = (placeholder: string) => {
    navigator.clipboard.writeText(placeholder);
    setCopiedPlaceholder(placeholder);
    setTimeout(() => setCopiedPlaceholder(null), 2000);
  };

  const emailPlaceholders = [
    { key: "{{candidate_name}}", desc: "Candidate's full name" },
    { key: "{{hiring_manager_name}}", desc: "Hiring manager name" },
    { key: "{{company_name}}", desc: "Company name" },
    { key: "{{job_title}}", desc: "Job title" },
    { key: "{{interview_date}}", desc: "Interview date" },
    { key: "{{interview_time}}", desc: "Interview time" },
    { key: "{{meeting_url}}", desc: "Meeting link" },
  ];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button 
            className={`relative flex items-center gap-1 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className || ''}`}
            aria-label="Open user menu"
          >
            <Avatar className="h-8 w-8 border">
              <AvatarImage src={user?.profilePicture || undefined} alt={displayName} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-lg border border-border/50">
          {/* User info - compact */}
          <DropdownMenuLabel className="font-normal py-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{displayName}</span>
              {isAdmin && <Badge variant="default" className="text-[9px] px-1 py-0 h-4">Admin</Badge>}
            </div>
          </DropdownMenuLabel>
          
          <DropdownMenuSeparator />
          
          
          {/* Theme - inline row */}
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-xs text-muted-foreground">Theme</span>
            <div className="flex gap-1">
              <button
                onClick={() => setTheme("light")}
                className={`p-1.5 rounded-md transition-colors ${theme === "light" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                title="Light"
              >
                <Sun className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={`p-1.5 rounded-md transition-colors ${theme === "dark" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                title="Dark"
              >
                <Moon className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setTheme("system")}
                className={`p-1.5 rounded-md transition-colors ${theme === "system" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                title="System"
              >
                <Monitor className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          
          {hriqActions && (
            <>
              <DropdownMenuSeparator />
              {hriqActions.onExportCSV && (
                <DropdownMenuItem onClick={hriqActions.onExportCSV} className="gap-2 cursor-pointer">
                  <Download className="h-4 w-4" />
                  Export CSV
                </DropdownMenuItem>
              )}
              {hriqActions.onAnnounce && (
                <DropdownMenuItem onClick={hriqActions.onAnnounce} className="gap-2 cursor-pointer">
                  <Megaphone className="h-4 w-4" />
                  Announce
                </DropdownMenuItem>
              )}
            </>
          )}
          
          <DropdownMenuSeparator />
          
          {/* Single Settings item - opens dialog with admin tab for admins */}
          <DropdownMenuItem 
            onClick={() => onSettingsClick ? onSettingsClick() : setSettingsOpen(true)} 
            className="gap-2 cursor-pointer"
          >
            <Settings className="h-4 w-4" />
            Settings
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => logout()} className="gap-2 text-red-600 cursor-pointer">
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Settings
            </DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="profile" className="mt-4">
            <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-5' : 'grid-cols-4'}`}>
              <TabsTrigger value="profile" className="gap-1.5">
                <User className="h-3.5 w-3.5" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="theme" className="gap-1.5">
                <Sun className="h-3.5 w-3.5" />
                Theme
              </TabsTrigger>
              <TabsTrigger value="templates" className="gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Templates
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-1.5">
                <Bell className="h-3.5 w-3.5" />
                Notifications
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="admin" className="gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  Admin
                </TabsTrigger>
              )}
            </TabsList>
            
            <TabsContent value="profile" className="space-y-6 mt-6">
              <div className="flex items-center gap-6">
                <Avatar className="h-20 w-20 border-2">
                  <AvatarImage src={user?.profilePicture || undefined} alt={displayName} />
                  <AvatarFallback className="bg-primary/10 text-primary text-2xl font-medium">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                  <h3 className="font-medium">{displayName}</h3>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Profile picture is synced from your Google account
                  </p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Display Name</Label>
                  <Input value={displayName} disabled className="bg-muted/50" />
                  <p className="text-xs text-muted-foreground">
                    Name is synced from your Google account
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={user?.email || ""} disabled className="bg-muted/50" />
                </div>
                
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Input value={isAdmin ? "Administrator" : "Team Member"} disabled className="bg-muted/50" />
                </div>
              </div>
              
            </TabsContent>
            
            <TabsContent value="theme" className="space-y-6 mt-6">
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-2">Appearance</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Choose how the dashboard looks for you.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <button
                    onClick={() => setTheme("light")}
                    className={`p-4 border rounded-lg text-center transition-colors ${theme === "light" ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  >
                    <Sun className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                    <span className="font-medium">Light</span>
                    {theme === "light" && <p className="text-xs text-primary mt-1">Active</p>}
                  </button>
                  <button
                    onClick={() => setTheme("dark")}
                    className={`p-4 border rounded-lg text-center transition-colors ${theme === "dark" ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  >
                    <Moon className="h-8 w-8 mx-auto mb-2 text-indigo-500" />
                    <span className="font-medium">Dark</span>
                    {theme === "dark" && <p className="text-xs text-primary mt-1">Active</p>}
                  </button>
                  <button
                    onClick={() => setTheme("system")}
                    className={`p-4 border rounded-lg text-center transition-colors ${theme === "system" ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  >
                    <Monitor className="h-8 w-8 mx-auto mb-2 text-gray-500" />
                    <span className="font-medium">System</span>
                    {theme === "system" && <p className="text-xs text-primary mt-1">Active</p>}
                  </button>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="templates" className="space-y-6 mt-6">
              <Tabs defaultValue="email" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="email" className="gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    Email Templates
                  </TabsTrigger>
                  <TabsTrigger value="whatsapp" className="gap-1.5">
                    <MessageCircle className="h-3.5 w-3.5" />
                    WhatsApp Templates
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="email" className="space-y-4">
                  {loadingEmailTemplates ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : !emailTemplates || emailTemplates.length === 0 ? (
                    <div className="text-center py-8 space-y-4">
                      <p className="text-muted-foreground">No email templates configured yet.</p>
                      <Button onClick={() => seedDefaultsMutation.mutate()} disabled={seedDefaultsMutation.isPending}>
                        {seedDefaultsMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Load Default Templates
                      </Button>
                    </div>
                  ) : (
                    <ScrollArea className="h-[350px]">
                      <div className="space-y-3 pr-4">
                        {emailTemplates.map((template) => (
                          <div key={template.id} className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium">{template.label}</h4>
                                  {template.isDefault && (
                                    <Badge variant="secondary" className="text-xs">Default</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
                                <p className="text-sm mt-2 font-mono text-muted-foreground">Subject: {template.subject}</p>
                              </div>
                              <Button variant="ghost" size="sm" onClick={() => openEditEmailDialog(template)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                  
                  {editingEmailTemplate && (
                    <Dialog open={!!editingEmailTemplate} onOpenChange={(open) => !open && setEditingEmailTemplate(null)}>
                      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Edit Email Template</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Template ID</Label>
                              <Input value={emailFormData.name} disabled className="bg-muted/50" />
                            </div>
                            <div className="space-y-2">
                              <Label>Label</Label>
                              <Input 
                                value={emailFormData.label}
                                onChange={(e) => setEmailFormData({ ...emailFormData, label: e.target.value })}
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Description</Label>
                            <Input 
                              value={emailFormData.description}
                              onChange={(e) => setEmailFormData({ ...emailFormData, description: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Subject Line</Label>
                            <Input 
                              value={emailFormData.subject}
                              onChange={(e) => setEmailFormData({ ...emailFormData, subject: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Email Body</Label>
                            <Textarea 
                              value={emailFormData.body}
                              onChange={(e) => setEmailFormData({ ...emailFormData, body: e.target.value })}
                              rows={8}
                              className="font-mono text-sm"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Placeholders (click to copy)</Label>
                            <div className="flex flex-wrap gap-1">
                              {emailPlaceholders.map((p) => (
                                <Button
                                  key={p.key}
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs font-mono"
                                  onClick={() => copyPlaceholder(p.key)}
                                >
                                  {copiedPlaceholder === p.key ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                                  {p.key}
                                </Button>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                          <Button variant="outline" onClick={() => setEditingEmailTemplate(null)}>Cancel</Button>
                          <Button 
                            onClick={() => updateEmailTemplateMutation.mutate({ id: editingEmailTemplate.id, data: emailFormData })}
                            disabled={updateEmailTemplateMutation.isPending}
                          >
                            {updateEmailTemplateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                            Save Changes
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </TabsContent>
                
                <TabsContent value="whatsapp" className="space-y-4">
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      WhatsApp templates are managed through respond.io and cannot be edited here. 
                      Contact your IT department to request new templates.
                    </AlertDescription>
                  </Alert>
                  
                  {loadingWhatsappTemplates ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : !whatsappTemplates || whatsappTemplates.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">No WhatsApp templates available.</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[300px]">
                      <div className="space-y-3 pr-4">
                        {whatsappTemplates.map((template) => (
                          <div key={template.id} className="p-4 border rounded-lg bg-muted/30">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-xs font-bold text-green-700 dark:text-green-400">
                                {template.id}
                              </div>
                              <h4 className="font-medium">{template.name}</h4>
                              {template.isDoubleMessage && (
                                <Badge variant="outline" className="text-xs">Follow-up</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-3">{template.preview}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </TabsContent>
              </Tabs>
            </TabsContent>
            
            <TabsContent value="notifications" className="space-y-6 mt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h4 className="font-medium">Email Notifications</h4>
                    <p className="text-sm text-muted-foreground">
                      Receive email updates about interviews and candidates
                    </p>
                  </div>
                  <Switch
                    checked={emailNotifications}
                    onCheckedChange={setEmailNotifications}
                  />
                </div>
                
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h4 className="font-medium">WhatsApp Notifications</h4>
                    <p className="text-sm text-muted-foreground">
                      Receive WhatsApp reminders for upcoming interviews
                    </p>
                  </div>
                  <Switch
                    checked={whatsappNotifications}
                    onCheckedChange={setWhatsappNotifications}
                  />
                </div>
              </div>
            </TabsContent>
            
            {isAdmin && (
              <TabsContent value="admin" className="space-y-6 mt-6">
                <div className="space-y-4">
                  <h3 className="font-medium">Admin Settings</h3>
                  
                  <div className="grid gap-4">
                    <Link href="/admin/users" onClick={() => setSettingsOpen(false)}>
                      <div className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Users className="h-5 w-5 text-primary" />
                            <div>
                              <h4 className="font-medium">User Management</h4>
                              <p className="text-sm text-muted-foreground">
                                View users, analytics, and send invites
                              </p>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground">→</span>
                        </div>
                      </div>
                    </Link>
                    
                    <Link href="/admin/calendars" onClick={() => setSettingsOpen(false)}>
                      <div className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                        <div className="flex items-center gap-3">
                          <Calendar className="h-5 w-5 text-primary" />
                          <div>
                            <h4 className="font-medium">Hiring Manager Calendars</h4>
                            <p className="text-sm text-muted-foreground">
                              View and manage individual HM calendar events
                            </p>
                          </div>
                        </div>
                      </div>
                    </Link>
                    
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Database className="h-5 w-5 text-primary" />
                          <div>
                            <h4 className="font-medium">Database Status</h4>
                            <p className="text-sm text-muted-foreground">
                              PostgreSQL connected and operational
                            </p>
                          </div>
                        </div>
                        <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded">
                          Connected
                        </span>
                      </div>
                    </div>
                    
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <RefreshCw className="h-5 w-5 text-primary" />
                          <div>
                            <h4 className="font-medium">CRM Sync</h4>
                            <p className="text-sm text-muted-foreground">
                              RecruitCRM integration status
                            </p>
                          </div>
                        </div>
                        <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded">
                          Active
                        </span>
                      </div>
                    </div>
                    
                    <Link href="/hriq" onClick={() => setSettingsOpen(false)}>
                      <div className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Code className="h-5 w-5 text-primary" />
                            <div>
                              <h4 className="font-medium">Develop</h4>
                              <p className="text-sm text-muted-foreground">
                                HRIQ development dashboard
                              </p>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground">→</span>
                        </div>
                      </div>
                    </Link>
                  </div>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
