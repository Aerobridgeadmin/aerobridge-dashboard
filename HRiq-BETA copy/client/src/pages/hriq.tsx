import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Building2, 
  Users, 
  UserPlus,
  UserMinus,
  Clock, 
  ArrowLeft,
  Search,
  Plus,
  Check,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Shield,
  ClipboardList,
  History,
  BarChart3,
  Loader2,
  Filter,
  Download,
  Megaphone,
  CreditCard,
  Phone,
  MessageSquare,
  Timer,
  DollarSign,
  Send,
  FileSpreadsheet,
  Upload,
  ExternalLink,
  RefreshCw,
  FileText,
  Lock,
  Link2,
  Video,
  Play,
  Mail,
  Copy
} from "lucide-react";
import remoteLeverageLogo from "@assets/remote_leverage_logo_transparent.png";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatarMenu } from "@/components/user-avatar-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

interface DashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  onboardingInProgress: number;
  offboardingInProgress: number;
  pendingTasks: number;
  overdueTasks: number;
}

interface Employee {
  id: string;
  employeeNumber: string;
  legalFirstName: string;
  legalLastName: string;
  preferredName: string | null;
  personalEmail: string | null;
  workEmail: string | null;
  phoneNumber: string | null;
  employmentType: string;
  department: string | null;
  role: string | null;
  managerId: string | null;
  location: string | null;
  timezone: string | null;
  startDate: string | null;
  endDate: string | null;
  employmentStatus: string;
  onboardingStatus: string;
  offboardingStatus: string;
  hriqRole: string;
  isLocked: boolean;
  createdAt: string;
  paymentPlatform: string | null;
  paymentAccountInfo: string | null;
  hourlyRate: string | null;
  currency: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  dailyHoursTarget: string | null;
  timeDoctorEmail: string | null;
}

interface DepartmentStat {
  department: string | null;
  count: number;
}

interface ManagerNote {
  id: string;
  employeeId: string;
  authorUserId: string | null;
  authorName: string | null;
  noteType: string;
  content: string;
  isPrivate: boolean;
  createdAt: string;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: string;
  targetDepartment: string | null;
  authorName: string | null;
  publishedAt: string;
  isActive: boolean;
}

interface ManagerNote {
  id: string;
  employeeId: string;
  authorUserId: string | null;
  authorName: string | null;
  noteType: string;
  content: string;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
}

const NOTE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  general: { label: "General", color: "bg-gray-100 text-gray-700" },
  performance: { label: "Performance", color: "bg-blue-100 text-blue-700" },
  feedback: { label: "Feedback", color: "bg-green-100 text-green-700" },
  warning: { label: "Warning", color: "bg-orange-100 text-orange-700" },
  commendation: { label: "Commendation", color: "bg-purple-100 text-purple-700" },
};

const PAYMENT_PLATFORMS = [
  { value: "wise", label: "Wise" },
  { value: "paypal", label: "PayPal" },
  { value: "payoneer", label: "Payoneer" },
  { value: "direct_deposit", label: "Direct Deposit" },
  { value: "other", label: "Other" },
];

interface Task {
  id: string;
  employeeId: string;
  taskType: string;
  title: string;
  description: string | null;
  ownerRole: string | null;
  dueDate: string | null;
  status: string;
  isBlocking: boolean;
  phase: string | null;
  createdAt: string;
}

interface AuditEntry {
  id: string;
  timestamp: string;
  actorType: string;
  actorUserId: string | null;
  action: string;
  objectType: string;
  objectId: string;
  reason: string | null;
}

interface ReportsData {
  period: number;
  newHires: Array<{
    id: string;
    name: string;
    department: string | null;
    role: string | null;
    startDate: string | null;
    employmentType: string;
  }>;
  terminations: Array<{
    id: string;
    name: string;
    department: string | null;
    role: string | null;
    endDate: string | null;
    status: string;
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    objectType: string;
    objectId: string;
    reason: string | null;
    timestamp: string;
    actorType: string;
  }>;
  summary: {
    newHiresCount: number;
    terminationsCount: number;
    totalActive: number;
  };
}

const EMPLOYMENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pre_hire: { label: "Pre-Hire", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  onboarding_scheduled: { label: "Onboarding Scheduled", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  onboarding_in_progress: { label: "Onboarding", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300" },
  active: { label: "Active", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  leave: { label: "On Leave", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
  termination_scheduled: { label: "Termination Scheduled", color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
  offboarding_in_progress: { label: "Offboarding", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  offboarded: { label: "Offboarded", color: "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400" },
};

const TASK_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  hr: { label: "HR", color: "bg-purple-100 text-purple-700" },
  it: { label: "IT", color: "bg-blue-100 text-blue-700" },
  manager: { label: "Manager", color: "bg-green-100 text-green-700" },
  employee: { label: "Employee", color: "bg-orange-100 text-orange-700" },
  finance: { label: "Finance", color: "bg-yellow-100 text-yellow-700" },
  security: { label: "Security", color: "bg-red-100 text-red-700" },
};

interface Payment {
  id: string;
  employeeId: string;
  paymentType: string;
  amount: string;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
  paymentDate: string | null;
  paymentMethod: string | null;
  transactionId: string | null;
  status: string;
  hoursWorked: string | null;
  hourlyRate: string | null;
  description: string | null;
  notes: string | null;
  processedByName: string | null;
  createdAt: string;
}

interface Document {
  id: string;
  employeeId: string;
  documentType: string;
  documentName: string;
  description: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  isExpired: boolean;
  status: string;
  isConfidential: boolean;
  uploadedByName: string | null;
  createdAt: string;
}

const PAYMENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  salary: { label: "Salary", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  bonus: { label: "Bonus", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
  reimbursement: { label: "Reimbursement", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  commission: { label: "Commission", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  adjustment: { label: "Adjustment", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
};

const PAYMENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
  processing: { label: "Processing", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  completed: { label: "Completed", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  failed: { label: "Failed", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
};

const DOCUMENT_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  w9: { label: "W-9 Form", icon: "📋" },
  i9: { label: "I-9 Form", icon: "📋" },
  contract: { label: "Contract", icon: "📝" },
  tax_form: { label: "Tax Form", icon: "📄" },
  id_document: { label: "ID Document", icon: "🪪" },
  resume: { label: "Resume", icon: "📑" },
  offer_letter: { label: "Offer Letter", icon: "✉️" },
  nda: { label: "NDA", icon: "🔒" },
  other: { label: "Other", icon: "📁" },
};

const DOCUMENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending Review", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
  verified: { label: "Verified", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  expired: { label: "Expired", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
};

function StatCard({ title, value, icon, trend, trendValue, description, onClick, variant = "default", emptyMessage }: { 
  title: string; 
  value: number | string; 
  icon: React.ReactNode; 
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  description?: string;
  onClick?: () => void;
  variant?: "default" | "success" | "warning" | "danger";
  emptyMessage?: string;
}) {
  const variantStyles = {
    default: "",
    success: "border-green-200 dark:border-green-800",
    warning: "border-amber-200 dark:border-amber-800",
    danger: "border-red-200 dark:border-red-800",
  };
  
  const isZero = value === 0 || value === "0";
  
  return (
    <Card 
      className={`transition-all ${onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5" : ""} ${variantStyles[variant]}`}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="p-2 rounded-lg bg-muted">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold">{value}</span>
          {trend && trendValue && (
            <span className={`text-xs font-medium ${trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-muted-foreground"}`}>
              {trend === "up" ? "↑" : trend === "down" ? "↓" : ""} {trendValue}
            </span>
          )}
        </div>
        {isZero && emptyMessage ? (
          <p className="text-xs text-muted-foreground mt-1">{emptyMessage}</p>
        ) : description ? (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        ) : null}
        {onClick && (
          <div className="flex items-center gap-1 text-xs text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <span>View details</span>
            <ChevronRight className="h-3 w-3" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmployeeRow({ employee, onClick }: { employee: Employee; onClick: () => void }) {
  const status = EMPLOYMENT_STATUS_LABELS[employee.employmentStatus] || { label: employee.employmentStatus, color: "bg-gray-100" };
  
  return (
    <div 
      className="flex items-center justify-between p-4 border-b hover:bg-muted/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
          {employee.legalFirstName[0]}{employee.legalLastName[0]}
        </div>
        <div>
          <div className="font-medium">{employee.legalFirstName} {employee.legalLastName}</div>
          <div className="text-sm text-muted-foreground">
            {employee.role || "No role"} {employee.department && `• ${employee.department}`}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Badge className={status.color}>{status.label}</Badge>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}

function TaskRow({ task, onComplete }: { task: Task; onComplete: () => void }) {
  const typeInfo = TASK_TYPE_LABELS[task.taskType] || { label: task.taskType, color: "bg-gray-100" };
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
  
  return (
    <div className="flex items-center justify-between p-4 border-b hover:bg-muted/50">
      <div className="flex items-center gap-4">
        <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
        <div>
          <div className="font-medium flex items-center gap-2">
            {task.title}
            {task.isBlocking && (
              <Badge variant="destructive" className="text-xs">Blocking</Badge>
            )}
          </div>
          {task.dueDate && (
            <div className={`text-sm ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
              Due: {format(new Date(task.dueDate), "MMM d, yyyy")}
              {isOverdue && " (Overdue)"}
            </div>
          )}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onComplete}>
        <CheckCircle2 className="h-4 w-4 mr-1" />
        Complete
      </Button>
    </div>
  );
}

function NewEmployeeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    legalFirstName: "",
    legalLastName: "",
    personalEmail: "",
    employmentType: "full_time",
    department: "",
    role: "",
  });
  
  const createEmployee = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/hriq/employees", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/dashboard"] });
      onOpenChange(false);
      setFormData({
        legalFirstName: "",
        legalLastName: "",
        personalEmail: "",
        employmentType: "full_time",
        department: "",
        role: "",
      });
    }
  });
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add New Employee</DialogTitle>
          <DialogDescription>
            Create a new employee record. They will start in Pre-Hire status.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Legal First Name</Label>
              <Input
                id="firstName"
                value={formData.legalFirstName}
                onChange={(e) => setFormData(prev => ({ ...prev, legalFirstName: e.target.value }))}
                placeholder="John"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Legal Last Name</Label>
              <Input
                id="lastName"
                value={formData.legalLastName}
                onChange={(e) => setFormData(prev => ({ ...prev, legalLastName: e.target.value }))}
                placeholder="Smith"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Personal Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.personalEmail}
              onChange={(e) => setFormData(prev => ({ ...prev, personalEmail: e.target.value }))}
              placeholder="john@example.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="employmentType">Employment Type</Label>
              <Select
                value={formData.employmentType}
                onValueChange={(value) => setFormData(prev => ({ ...prev, employmentType: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full-Time</SelectItem>
                  <SelectItem value="part_time">Part-Time</SelectItem>
                  <SelectItem value="contractor">Contractor</SelectItem>
                  <SelectItem value="intern">Intern</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                value={formData.department}
                onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                placeholder="Engineering"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role / Title</Label>
            <Input
              id="role"
              value={formData.role}
              onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
              placeholder="Software Engineer"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button 
            onClick={() => createEmployee.mutate(formData)}
            disabled={!formData.legalFirstName || !formData.legalLastName || createEmployee.isPending}
          >
            {createEmployee.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Employee
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmployeeDetailDialog({ 
  employee, 
  open, 
  onOpenChange 
}: { 
  employee: Employee | null; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Employee>>({});
  const [noteForm, setNoteForm] = useState({ noteType: "general", content: "", isPrivate: false });
  const [showAddNote, setShowAddNote] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showAddDocument, setShowAddDocument] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    paymentType: "salary",
    amount: "",
    paymentDate: "",
    paymentMethod: "",
    periodStart: "",
    periodEnd: "",
    hoursWorked: "",
    description: "",
  });
  const [documentForm, setDocumentForm] = useState({
    documentType: "contract",
    documentName: "",
    description: "",
    issuedDate: "",
    expiryDate: "",
    isConfidential: false,
  });
  
  const { data: tasks } = useQuery<Task[]>({
    queryKey: ["/api/hriq/employees", employee?.id, "tasks"],
    queryFn: async () => {
      const res = await fetch(`/api/hriq/employees/${employee?.id}/tasks`);
      return res.json();
    },
    enabled: !!employee?.id && open,
  });

  const { data: notes, isLoading: notesLoading } = useQuery<ManagerNote[]>({
    queryKey: ["/api/hriq/employees", employee?.id, "notes"],
    queryFn: async () => {
      const res = await fetch(`/api/hriq/employees/${employee?.id}/notes`);
      return res.json();
    },
    enabled: !!employee?.id && open,
  });

  const { data: payments, isLoading: paymentsLoading } = useQuery<Payment[]>({
    queryKey: ["/api/hriq/employees", employee?.id, "payments"],
    queryFn: async () => {
      const res = await fetch(`/api/hriq/employees/${employee?.id}/payments`);
      return res.json();
    },
    enabled: !!employee?.id && open,
  });

  const { data: documents, isLoading: documentsLoading } = useQuery<Document[]>({
    queryKey: ["/api/hriq/employees", employee?.id, "documents"],
    queryFn: async () => {
      const res = await fetch(`/api/hriq/employees/${employee?.id}/documents`);
      return res.json();
    },
    enabled: !!employee?.id && open,
  });

  const { data: onboarding, isLoading: onboardingLoading, refetch: refetchOnboarding } = useQuery<{
    id: string;
    status: string;
    currentStep: string;
    overallProgress: number;
    zoomMeetingLink: string | null;
    zoomMeetingDate: string | null;
    zoomInviteSent: boolean;
    zoomAttended: boolean;
    jotformsSent: boolean;
    steps: Array<{
      id: string;
      stepType: string;
      stepName: string;
      status: string;
      sortOrder: number;
      formUrl?: string;
      completedAt?: string;
    }>;
  } | null>({
    queryKey: ["/api/hriq/employees", employee?.id, "onboarding"],
    queryFn: async () => {
      const res = await fetch(`/api/hriq/employees/${employee?.id}/onboarding`);
      return res.json();
    },
    enabled: !!employee?.id && open,
  });
  
  const updateStatus = useMutation({
    mutationFn: async ({ status, reason }: { status: string; reason?: string }) => {
      const res = await apiRequest("POST", `/api/hriq/employees/${employee?.id}/status`, { status, reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/tasks"] });
    }
  });

  const updateEmployee = useMutation({
    mutationFn: async (data: Partial<Employee>) => {
      const res = await apiRequest("PATCH", `/api/hriq/employees/${employee?.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/employees"] });
      setEditMode(false);
    }
  });

  const addNote = useMutation({
    mutationFn: async (data: typeof noteForm) => {
      const res = await apiRequest("POST", `/api/hriq/employees/${employee?.id}/notes`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/employees", employee?.id, "notes"] });
      setShowAddNote(false);
      setNoteForm({ noteType: "general", content: "", isPrivate: false });
    }
  });

  const addPayment = useMutation({
    mutationFn: async (data: typeof paymentForm) => {
      const res = await apiRequest("POST", `/api/hriq/employees/${employee?.id}/payments`, {
        ...data,
        hourlyRate: employee?.hourlyRate,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/employees", employee?.id, "payments"] });
      setShowAddPayment(false);
      setPaymentForm({
        paymentType: "salary",
        amount: "",
        paymentDate: "",
        paymentMethod: employee?.paymentPlatform?.toLowerCase().replace(" ", "_") || "",
        periodStart: "",
        periodEnd: "",
        hoursWorked: "",
        description: "",
      });
    }
  });

  const addDocument = useMutation({
    mutationFn: async (data: typeof documentForm) => {
      const res = await apiRequest("POST", `/api/hriq/employees/${employee?.id}/documents`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/employees", employee?.id, "documents"] });
      setShowAddDocument(false);
      setDocumentForm({
        documentType: "contract",
        documentName: "",
        description: "",
        issuedDate: "",
        expiryDate: "",
        isConfidential: false,
      });
    }
  });

  const startOnboarding = useMutation({
    mutationFn: async (data: { zoomMeetingLink?: string; zoomMeetingDate?: string }) => {
      const res = await apiRequest("POST", `/api/hriq/employees/${employee?.id}/onboarding/start`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/employees", employee?.id, "onboarding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/employees"] });
    }
  });

  const createZoomMeeting = useMutation({
    mutationFn: async ({ sessionId, scheduledDate }: { sessionId: string; scheduledDate?: string }) => {
      const res = await apiRequest("POST", `/api/hriq/onboarding/${sessionId}/create-zoom-meeting`, {
        scheduledDate,
        duration: 60,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/employees", employee?.id, "onboarding"] });
    }
  });

  const sendZoomInvite = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await apiRequest("POST", `/api/hriq/onboarding/${sessionId}/send-zoom-invite`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/employees", employee?.id, "onboarding"] });
    }
  });

  const markZoomAttended = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await apiRequest("POST", `/api/hriq/onboarding/${sessionId}/mark-zoom-attended`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/employees", employee?.id, "onboarding"] });
    }
  });

  const updateOnboardingStep = useMutation({
    mutationFn: async ({ stepId, status }: { stepId: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/hriq/onboarding/steps/${stepId}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/employees", employee?.id, "onboarding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/employees"] });
    }
  });

  const { data: jotforms } = useQuery<{ id: string; title: string; url: string; status: string }[]>({
    queryKey: ["/api/hriq/jotform/forms"],
    queryFn: async () => {
      const res = await fetch("/api/hriq/jotform/forms");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && activeTab === "onboarding",
  });

  const [showJotformDialog, setShowJotformDialog] = useState(false);
  const [selectedJotform, setSelectedJotform] = useState<string | null>(null);
  const [generatedJotformUrl, setGeneratedJotformUrl] = useState<string | null>(null);

  const [showZoomScheduleDialog, setShowZoomScheduleDialog] = useState(false);
  const [scheduledMeetingDate, setScheduledMeetingDate] = useState<string>("");
  const [scheduledMeetingTime, setScheduledMeetingTime] = useState<string>("10:00");

  const sendJotform = useMutation({
    mutationFn: async ({ sessionId, formId, formName }: { sessionId: string; formId: string; formName: string }) => {
      const res = await apiRequest("POST", `/api/hriq/onboarding/${sessionId}/send-jotforms`, { formId, formName });
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedJotformUrl(data.prefillUrl);
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/employees", employee?.id, "onboarding"] });
    }
  });

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open && employee) {
      setEditForm({
        paymentPlatform: employee.paymentPlatform,
        hourlyRate: employee.hourlyRate,
        personalEmail: employee.personalEmail,
        emergencyContactName: employee.emergencyContactName,
        emergencyContactPhone: employee.emergencyContactPhone,
        emergencyContactRelation: employee.emergencyContactRelation,
        timeDoctorEmail: employee.timeDoctorEmail,
      });
      setActiveTab("overview");
      setEditMode(false);
    }
  }, [open, employee]);
  
  if (!employee) return null;
  
  const status = EMPLOYMENT_STATUS_LABELS[employee.employmentStatus];
  
  const canStartOnboarding = employee.employmentStatus === "pre_hire";
  const canStartOffboarding = employee.employmentStatus === "active";
  const canActivate = employee.employmentStatus === "onboarding_in_progress";
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-xl font-medium text-primary">
                {employee.legalFirstName[0]}{employee.legalLastName[0]}
              </div>
              <div>
                <DialogTitle className="text-xl">{employee.legalFirstName} {employee.legalLastName}</DialogTitle>
                <DialogDescription className="flex items-center gap-2 mt-1">
                  <span>{employee.employeeNumber}</span>
                  <span>•</span>
                  <span>{employee.role || "No role"}</span>
                  {employee.department && (
                    <>
                      <span>•</span>
                      <Badge variant="outline" className="text-xs">{employee.department}</Badge>
                    </>
                  )}
                </DialogDescription>
              </div>
            </div>
            <Badge className={status.color}>{status.label}</Badge>
          </div>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full justify-start flex-wrap h-auto gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="onboarding" className="flex items-center gap-1">
              Onboarding
              {onboarding && onboarding.status === 'in_progress' && (
                <span className="text-xs bg-amber-500/20 text-amber-600 px-1 rounded">{onboarding.overallProgress}%</span>
              )}
              {onboarding && onboarding.status === 'completed' && (
                <CheckCircle2 className="h-3 w-3 text-green-600" />
              )}
            </TabsTrigger>
            <TabsTrigger value="pay">Pay & Personal</TabsTrigger>
            <TabsTrigger value="payments">Payments ({payments?.length || 0})</TabsTrigger>
            <TabsTrigger value="documents">Documents ({documents?.length || 0})</TabsTrigger>
            <TabsTrigger value="notes">Notes ({notes?.length || 0})</TabsTrigger>
            <TabsTrigger value="tasks">Tasks ({tasks?.length || 0})</TabsTrigger>
          </TabsList>
          
          <ScrollArea className="flex-1 pr-4 mt-4">
            <TabsContent value="overview" className="mt-0 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-3 rounded-lg bg-muted/30">
                  <div className="text-muted-foreground text-xs uppercase tracking-wide">Employment Type</div>
                  <div className="font-medium mt-1 capitalize">{employee.employmentType.replace("_", "-")}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30">
                  <div className="text-muted-foreground text-xs uppercase tracking-wide">Location</div>
                  <div className="font-medium mt-1">{employee.location || "Not set"}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30">
                  <div className="text-muted-foreground text-xs uppercase tracking-wide">Work Email</div>
                  <div className="font-medium mt-1 truncate">{employee.workEmail || "Not set"}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30">
                  <div className="text-muted-foreground text-xs uppercase tracking-wide">Phone</div>
                  <div className="font-medium mt-1">{employee.phoneNumber || "Not set"}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30">
                  <div className="text-muted-foreground text-xs uppercase tracking-wide">Start Date</div>
                  <div className="font-medium mt-1">
                    {employee.startDate ? format(new Date(employee.startDate), "MMM d, yyyy") : "Not set"}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30">
                  <div className="text-muted-foreground text-xs uppercase tracking-wide">Onboarding Status</div>
                  <div className="font-medium mt-1 capitalize">{employee.onboardingStatus.replace("_", " ")}</div>
                </div>
              </div>
              
              {!employee.isLocked && (
                <div className="flex gap-2 flex-wrap pt-2">
                  {canStartOnboarding && (
                    <Button 
                      onClick={() => updateStatus.mutate({ status: "onboarding_scheduled" })}
                      disabled={updateStatus.isPending}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Start Onboarding
                    </Button>
                  )}
                  {canActivate && (
                    <Button 
                      onClick={() => updateStatus.mutate({ status: "active" })}
                      disabled={updateStatus.isPending}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Mark as Active
                    </Button>
                  )}
                  {canStartOffboarding && (
                    <Button 
                      variant="destructive"
                      onClick={() => updateStatus.mutate({ status: "termination_scheduled", reason: "Initiated by HR" })}
                      disabled={updateStatus.isPending}
                    >
                      <UserMinus className="h-4 w-4 mr-2" />
                      Start Offboarding
                    </Button>
                  )}
                </div>
              )}
              
              {employee.isLocked && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-300">
                    This employee record is locked and cannot be modified.
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="onboarding" className="mt-0 space-y-4">
              {onboardingLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !onboarding ? (
                <div className="space-y-4">
                  <div className="p-6 rounded-lg border-2 border-dashed border-muted text-center">
                    <UserPlus className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <h4 className="font-semibold mb-2">Start Employee Onboarding</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Begin the onboarding process including Zoom orientation, form collection, and document verification.
                    </p>
                    <Button
                      onClick={() => startOnboarding.mutate({})}
                      disabled={startOnboarding.isPending}
                    >
                      {startOnboarding.isPending ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Starting...</>
                      ) : (
                        <><Play className="h-4 w-4 mr-2" /> Start Onboarding</>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-medium">Overall Progress</div>
                      <Badge variant={onboarding.status === 'completed' ? 'default' : 'secondary'}>
                        {onboarding.status === 'completed' ? 'Completed' : 'In Progress'}
                      </Badge>
                    </div>
                    <div className="text-2xl font-bold">{onboarding.overallProgress}%</div>
                  </div>
                  <Progress value={onboarding.overallProgress} className="h-2" />

                  {onboarding.zoomMeetingLink && (
                    <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 mt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Video className="h-5 w-5 text-blue-600" />
                          <div>
                            <div className="font-medium text-sm">Zoom Meeting Scheduled</div>
                            {onboarding.zoomMeetingDate && (
                              <div className="text-xs text-muted-foreground">
                                {format(new Date(onboarding.zoomMeetingDate), "EEEE, MMM d, yyyy 'at' h:mm a")}
                              </div>
                            )}
                          </div>
                        </div>
                        <a
                          href={onboarding.zoomMeetingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Join Meeting
                        </a>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 mt-6">
                    {onboarding.steps?.map((step, index) => {
                      const isComplete = step.status === 'completed';
                      const isCurrent = !isComplete && onboarding.currentStep === step.stepType;
                      const Icon = step.stepType === 'zoom_invite' || step.stepType === 'zoom_attendance' 
                        ? Video 
                        : step.stepType === 'jotform' 
                        ? FileText 
                        : step.stepType === 'document' 
                        ? Upload 
                        : CheckCircle2;
                      
                      return (
                        <div 
                          key={step.id}
                          className={`p-4 rounded-lg border ${isComplete ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : isCurrent ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800' : 'bg-muted/30 border-muted'}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`h-8 w-8 rounded-full flex items-center justify-center ${isComplete ? 'bg-green-500 text-white' : isCurrent ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                                {isComplete ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                              </div>
                              <div>
                                <div className="font-medium">{step.stepName}</div>
                                <div className="text-xs text-muted-foreground capitalize">{step.stepType.replace('_', ' ')}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {isComplete && step.completedAt && (
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(step.completedAt), "MMM d, h:mm a")}
                                </span>
                              )}
                              {!isComplete && (
                                <div className="flex items-center gap-2">
                                  {step.stepType === 'zoom_invite' && !onboarding.zoomMeetingLink && (
                                    <Button 
                                      size="sm" 
                                      onClick={() => {
                                        const tomorrow = new Date();
                                        tomorrow.setDate(tomorrow.getDate() + 1);
                                        setScheduledMeetingDate(tomorrow.toISOString().split('T')[0]);
                                        setScheduledMeetingTime("10:00");
                                        setShowZoomScheduleDialog(true);
                                      }}
                                      disabled={createZoomMeeting.isPending}
                                    >
                                      {createZoomMeeting.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Video className="h-3 w-3 mr-1" />}
                                      Schedule Zoom Meeting
                                    </Button>
                                  )}
                                  {step.stepType === 'zoom_invite' && onboarding.zoomMeetingLink && (
                                    <Button 
                                      size="sm" 
                                      onClick={() => sendZoomInvite.mutate(onboarding.id)}
                                      disabled={sendZoomInvite.isPending}
                                    >
                                      {sendZoomInvite.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3 mr-1" />}
                                      Mark Invite Sent
                                    </Button>
                                  )}
                                  {step.stepType === 'zoom_attendance' && (
                                    <Button 
                                      size="sm" 
                                      onClick={() => markZoomAttended.mutate(onboarding.id)}
                                      disabled={markZoomAttended.isPending}
                                    >
                                      {markZoomAttended.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                                      Mark Attended
                                    </Button>
                                  )}
                                  {step.stepType === 'jotform' && (
                                    <Button 
                                      size="sm" 
                                      variant="default"
                                      onClick={() => {
                                        setSelectedJotform(null);
                                        setGeneratedJotformUrl(null);
                                        setShowJotformDialog(true);
                                      }}
                                    >
                                      <FileText className="h-3 w-3 mr-1" />
                                      Send JotForm
                                    </Button>
                                  )}
                                  {(step.stepType === 'jotform' || step.stepType === 'document') && (
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={() => updateOnboardingStep.mutate({ stepId: step.id, status: 'completed' })}
                                      disabled={updateOnboardingStep.isPending}
                                    >
                                      {updateOnboardingStep.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                                      Mark Complete
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          {step.formUrl && !isComplete && (
                            <div className="mt-2 pl-11">
                              <a 
                                href={step.formUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline flex items-center gap-1"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Open Form
                              </a>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {onboarding.status === 'completed' && (
                    <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="font-medium">Onboarding Complete</span>
                      </div>
                      <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                        All onboarding steps have been completed. Employee is now fully onboarded.
                      </p>
                    </div>
                  )}
                </div>
              )}
              
              {/* JotForm Selection Dialog */}
              <Dialog open={showJotformDialog} onOpenChange={setShowJotformDialog}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Send JotForm</DialogTitle>
                    <DialogDescription>
                      Select a form to send to {employee.firstName}. The form will be pre-filled with their information.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    {!generatedJotformUrl ? (
                      <>
                        <div className="space-y-2">
                          <Label>Select Form</Label>
                          <Select value={selectedJotform || ""} onValueChange={setSelectedJotform}>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose a JotForm..." />
                            </SelectTrigger>
                            <SelectContent>
                              {jotforms?.filter(f => f.status === "ENABLED").map((form) => (
                                <SelectItem key={form.id} value={form.id}>
                                  {form.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={() => setShowJotformDialog(false)}>
                            Cancel
                          </Button>
                          <Button 
                            onClick={() => {
                              if (selectedJotform && onboarding) {
                                const form = jotforms?.find(f => f.id === selectedJotform);
                                sendJotform.mutate({ 
                                  sessionId: onboarding.id, 
                                  formId: selectedJotform,
                                  formName: form?.title || "Unknown Form"
                                });
                              }
                            }}
                            disabled={!selectedJotform || sendJotform.isPending}
                          >
                            {sendJotform.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Send className="h-4 w-4 mr-2" />
                            )}
                            Generate Link
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                          <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-2">
                            <CheckCircle2 className="h-5 w-5" />
                            <span className="font-medium">Form Link Generated!</span>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            Copy this link and send it to the employee. The form is pre-filled with their information.
                          </p>
                          <div className="flex gap-2">
                            <Input 
                              value={generatedJotformUrl} 
                              readOnly 
                              className="text-xs"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                navigator.clipboard.writeText(generatedJotformUrl);
                              }}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="outline" 
                            onClick={() => {
                              setGeneratedJotformUrl(null);
                              setSelectedJotform(null);
                            }}
                          >
                            Send Another
                          </Button>
                          <Button 
                            onClick={() => {
                              window.open(generatedJotformUrl, '_blank');
                            }}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Open Form
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              {/* Zoom Scheduling Dialog */}
              <Dialog open={showZoomScheduleDialog} onOpenChange={setShowZoomScheduleDialog}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Schedule Zoom Meeting</DialogTitle>
                    <DialogDescription>
                      Schedule an onboarding meeting with {employee.firstName}. The meeting link will be generated automatically.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Date</Label>
                        <Input 
                          type="date" 
                          value={scheduledMeetingDate}
                          onChange={(e) => setScheduledMeetingDate(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Time</Label>
                        <Select value={scheduledMeetingTime} onValueChange={setScheduledMeetingTime}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", 
                              "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
                              "16:00", "16:30", "17:00", "17:30", "18:00"].map((time) => (
                              <SelectItem key={time} value={time}>{time}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setShowZoomScheduleDialog(false)}>
                        Cancel
                      </Button>
                      <Button 
                        onClick={() => {
                          if (onboarding && scheduledMeetingDate && scheduledMeetingTime) {
                            const scheduledDateTime = new Date(`${scheduledMeetingDate}T${scheduledMeetingTime}:00`);
                            createZoomMeeting.mutate({ 
                              sessionId: onboarding.id, 
                              scheduledDate: scheduledDateTime.toISOString()
                            });
                            setShowZoomScheduleDialog(false);
                          }
                        }}
                        disabled={!scheduledMeetingDate || !scheduledMeetingTime || createZoomMeeting.isPending}
                      >
                        {createZoomMeeting.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Video className="h-4 w-4 mr-2" />
                        )}
                        Create Meeting
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </TabsContent>
            
            <TabsContent value="pay" className="mt-0 space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="font-semibold">Payment & Personal Information</h4>
                {!employee.isLocked && (
                  <Button 
                    variant={editMode ? "default" : "outline"} 
                    size="sm"
                    onClick={() => {
                      if (editMode) {
                        updateEmployee.mutate(editForm);
                      } else {
                        setEditMode(true);
                      }
                    }}
                    disabled={updateEmployee.isPending}
                  >
                    {updateEmployee.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : editMode ? (
                      "Save Changes"
                    ) : (
                      "Edit"
                    )}
                  </Button>
                )}
              </div>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Payment Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Payment Platform</Label>
                      {editMode ? (
                        <Select 
                          value={editForm.paymentPlatform || ""} 
                          onValueChange={(v) => setEditForm(f => ({ ...f, paymentPlatform: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select platform" />
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_PLATFORMS.map(p => (
                              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="font-medium">
                          {PAYMENT_PLATFORMS.find(p => p.value === employee.paymentPlatform)?.label || "Not set"}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Hourly Rate (USD)</Label>
                      {editMode ? (
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="number"
                            step="0.01"
                            className="pl-9"
                            value={editForm.hourlyRate || ""}
                            onChange={(e) => setEditForm(f => ({ ...f, hourlyRate: e.target.value }))}
                            placeholder="0.00"
                          />
                        </div>
                      ) : (
                        <div className="font-medium">
                          {employee.hourlyRate ? `$${employee.hourlyRate}/hr` : "Not set"}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Timer className="h-4 w-4" />
                    Time Tracking
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Time Doctor Email</Label>
                    {editMode ? (
                      <Input
                        type="email"
                        value={editForm.timeDoctorEmail || ""}
                        onChange={(e) => setEditForm(f => ({ ...f, timeDoctorEmail: e.target.value }))}
                        placeholder="employee@timedoctor.com"
                      />
                    ) : (
                      <div className="font-medium">{employee.timeDoctorEmail || "Not configured"}</div>
                    )}
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-sm">
                    <p className="text-muted-foreground">Daily target: <span className="font-medium text-foreground">7h 15m</span></p>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Emergency Contact
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Contact Name</Label>
                      {editMode ? (
                        <Input
                          value={editForm.emergencyContactName || ""}
                          onChange={(e) => setEditForm(f => ({ ...f, emergencyContactName: e.target.value }))}
                          placeholder="Full name"
                        />
                      ) : (
                        <div className="font-medium">{employee.emergencyContactName || "Not set"}</div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Relationship</Label>
                      {editMode ? (
                        <Input
                          value={editForm.emergencyContactRelation || ""}
                          onChange={(e) => setEditForm(f => ({ ...f, emergencyContactRelation: e.target.value }))}
                          placeholder="e.g., Spouse, Parent"
                        />
                      ) : (
                        <div className="font-medium">{employee.emergencyContactRelation || "Not set"}</div>
                      )}
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label className="text-xs text-muted-foreground">Phone Number</Label>
                      {editMode ? (
                        <Input
                          value={editForm.emergencyContactPhone || ""}
                          onChange={(e) => setEditForm(f => ({ ...f, emergencyContactPhone: e.target.value }))}
                          placeholder="+1 (555) 123-4567"
                        />
                      ) : (
                        <div className="font-medium">{employee.emergencyContactPhone || "Not set"}</div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Personal Email</CardTitle>
                </CardHeader>
                <CardContent>
                  {editMode ? (
                    <Input
                      type="email"
                      value={editForm.personalEmail || ""}
                      onChange={(e) => setEditForm(f => ({ ...f, personalEmail: e.target.value }))}
                      placeholder="personal@email.com"
                    />
                  ) : (
                    <div className="font-medium">{employee.personalEmail || "Not set"}</div>
                  )}
                </CardContent>
              </Card>

              {editMode && (
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
                  <Button onClick={() => updateEmployee.mutate(editForm)} disabled={updateEmployee.isPending}>
                    {updateEmployee.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Save Changes
                  </Button>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="notes" className="mt-0 space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="font-semibold flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Manager Notes
                </h4>
                <Button size="sm" onClick={() => setShowAddNote(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Note
                </Button>
              </div>
              
              {showAddNote && (
                <Card className="border-primary">
                  <CardContent className="pt-4 space-y-4">
                    <div className="space-y-2">
                      <Label>Note Type</Label>
                      <Select value={noteForm.noteType} onValueChange={(v) => setNoteForm(f => ({ ...f, noteType: v }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(NOTE_TYPE_LABELS).map(([value, info]) => (
                            <SelectItem key={value} value={value}>{info.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Content</Label>
                      <textarea
                        className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="Write your note..."
                        value={noteForm.content}
                        onChange={(e) => setNoteForm(f => ({ ...f, content: e.target.value }))}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        id="private-note"
                        checked={noteForm.isPrivate}
                        onChange={(e) => setNoteForm(f => ({ ...f, isPrivate: e.target.checked }))}
                        className="rounded border-gray-300"
                      />
                      <Label htmlFor="private-note" className="text-sm text-muted-foreground">
                        Private note (only visible to HR/Admin)
                      </Label>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowAddNote(false)}>Cancel</Button>
                      <Button 
                        size="sm" 
                        onClick={() => addNote.mutate(noteForm)}
                        disabled={!noteForm.content || addNote.isPending}
                      >
                        {addNote.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Save Note
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {notesLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : notes && notes.length > 0 ? (
                <div className="space-y-3">
                  {notes.map((note) => {
                    const typeInfo = NOTE_TYPE_LABELS[note.noteType] || NOTE_TYPE_LABELS.general;
                    return (
                      <Card key={note.id} className={note.isPrivate ? "border-dashed" : ""}>
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
                              {note.isPrivate && <Badge variant="outline" className="text-xs">Private</Badge>}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(note.createdAt), "MMM d, yyyy 'at' h:mm a")}
                            </span>
                          </div>
                          <p className="mt-2 text-sm">{note.content}</p>
                          <p className="mt-2 text-xs text-muted-foreground">— {note.authorName}</p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No notes yet</p>
                  <p className="text-sm">Add notes to track performance, feedback, or important information.</p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="tasks" className="mt-0 space-y-4">
              <h4 className="font-semibold flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Assigned Tasks
              </h4>
              
              {tasks && tasks.length > 0 ? (
                <div className="border rounded-lg">
                  {tasks.map((task) => {
                    const typeInfo = TASK_TYPE_LABELS[task.taskType] || { label: task.taskType, color: "bg-gray-100" };
                    return (
                      <div key={task.id} className="flex items-center justify-between p-3 border-b last:border-0">
                        <div className="flex items-center gap-2">
                          <Badge className={typeInfo.color} variant="secondary">{typeInfo.label}</Badge>
                          <span className="text-sm">{task.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {task.dueDate && (
                            <span className="text-xs text-muted-foreground">
                              Due: {format(new Date(task.dueDate), "MMM d")}
                            </span>
                          )}
                          <Badge variant={task.status === "completed" ? "default" : "outline"}>
                            {task.status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No tasks assigned</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="payments" className="mt-0 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Payment History
                </h4>
                <Button size="sm" onClick={() => setShowAddPayment(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Payment
                </Button>
              </div>

              {showAddPayment && (
                <Card className="border-primary">
                  <CardContent className="pt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground">Payment Type</label>
                        <Select 
                          value={paymentForm.paymentType} 
                          onValueChange={(v) => setPaymentForm({...paymentForm, paymentType: v})}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="salary">Salary</SelectItem>
                            <SelectItem value="bonus">Bonus</SelectItem>
                            <SelectItem value="reimbursement">Reimbursement</SelectItem>
                            <SelectItem value="commission">Commission</SelectItem>
                            <SelectItem value="adjustment">Adjustment</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Amount (USD)</label>
                        <Input
                          className="h-9"
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={paymentForm.amount}
                          onChange={(e) => setPaymentForm({...paymentForm, amount: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Payment Date</label>
                        <Input
                          className="h-9"
                          type="date"
                          value={paymentForm.paymentDate}
                          onChange={(e) => setPaymentForm({...paymentForm, paymentDate: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Payment Method</label>
                        <Select 
                          value={paymentForm.paymentMethod} 
                          onValueChange={(v) => setPaymentForm({...paymentForm, paymentMethod: v})}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="wise">Wise</SelectItem>
                            <SelectItem value="paypal">PayPal</SelectItem>
                            <SelectItem value="payoneer">Payoneer</SelectItem>
                            <SelectItem value="direct_deposit">Direct Deposit</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Period Start</label>
                        <Input
                          className="h-9"
                          type="date"
                          value={paymentForm.periodStart}
                          onChange={(e) => setPaymentForm({...paymentForm, periodStart: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Period End</label>
                        <Input
                          className="h-9"
                          type="date"
                          value={paymentForm.periodEnd}
                          onChange={(e) => setPaymentForm({...paymentForm, periodEnd: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Hours Worked</label>
                        <Input
                          className="h-9"
                          type="number"
                          step="0.25"
                          placeholder="0"
                          value={paymentForm.hoursWorked}
                          onChange={(e) => setPaymentForm({...paymentForm, hoursWorked: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Description</label>
                        <Input
                          className="h-9"
                          placeholder="Payment description..."
                          value={paymentForm.description}
                          onChange={(e) => setPaymentForm({...paymentForm, description: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => setShowAddPayment(false)}>
                        Cancel
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={() => addPayment.mutate(paymentForm)}
                        disabled={!paymentForm.amount || addPayment.isPending}
                      >
                        {addPayment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Payment"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {paymentsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : payments && payments.length > 0 ? (
                <div className="border rounded-lg divide-y">
                  {payments.map((payment) => {
                    const typeInfo = PAYMENT_TYPE_LABELS[payment.paymentType] || { label: payment.paymentType, color: "bg-gray-100" };
                    const statusInfo = PAYMENT_STATUS_LABELS[payment.status] || { label: payment.status, color: "bg-gray-100" };
                    return (
                      <div key={payment.id} className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge className={typeInfo.color} variant="secondary">{typeInfo.label}</Badge>
                            <span className="font-semibold text-lg">${parseFloat(payment.amount).toLocaleString()}</span>
                            <span className="text-muted-foreground text-sm">{payment.currency}</span>
                          </div>
                          <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          {payment.paymentDate && (
                            <span>Paid: {format(new Date(payment.paymentDate), "MMM d, yyyy")}</span>
                          )}
                          {payment.periodStart && payment.periodEnd && (
                            <span>Period: {format(new Date(payment.periodStart), "MMM d")} - {format(new Date(payment.periodEnd), "MMM d")}</span>
                          )}
                          {payment.hoursWorked && (
                            <span>{payment.hoursWorked} hours</span>
                          )}
                          {payment.paymentMethod && (
                            <span className="capitalize">{payment.paymentMethod.replace("_", " ")}</span>
                          )}
                        </div>
                        {payment.description && (
                          <p className="text-sm text-muted-foreground mt-1">{payment.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No payment records</p>
                  <p className="text-sm">Add payments to track compensation history.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="documents" className="mt-0 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Employee Documents
                </h4>
                <Button size="sm" onClick={() => setShowAddDocument(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Document
                </Button>
              </div>

              {showAddDocument && (
                <Card className="border-primary">
                  <CardContent className="pt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground">Document Type</label>
                        <Select 
                          value={documentForm.documentType} 
                          onValueChange={(v) => setDocumentForm({...documentForm, documentType: v})}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="w9">W-9 Form</SelectItem>
                            <SelectItem value="i9">I-9 Form</SelectItem>
                            <SelectItem value="contract">Contract</SelectItem>
                            <SelectItem value="tax_form">Tax Form</SelectItem>
                            <SelectItem value="id_document">ID Document</SelectItem>
                            <SelectItem value="resume">Resume</SelectItem>
                            <SelectItem value="offer_letter">Offer Letter</SelectItem>
                            <SelectItem value="nda">NDA</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Document Name</label>
                        <Input
                          className="h-9"
                          placeholder="e.g., W-9 Form 2024"
                          value={documentForm.documentName}
                          onChange={(e) => setDocumentForm({...documentForm, documentName: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Issue Date</label>
                        <Input
                          className="h-9"
                          type="date"
                          value={documentForm.issuedDate}
                          onChange={(e) => setDocumentForm({...documentForm, issuedDate: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Expiry Date (if applicable)</label>
                        <Input
                          className="h-9"
                          type="date"
                          value={documentForm.expiryDate}
                          onChange={(e) => setDocumentForm({...documentForm, expiryDate: e.target.value})}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-muted-foreground">Description</label>
                        <Input
                          className="h-9"
                          placeholder="Optional description..."
                          value={documentForm.description}
                          onChange={(e) => setDocumentForm({...documentForm, description: e.target.value})}
                        />
                      </div>
                      <div className="col-span-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="isConfidential"
                          checked={documentForm.isConfidential}
                          onChange={(e) => setDocumentForm({...documentForm, isConfidential: e.target.checked})}
                          className="h-4 w-4"
                        />
                        <label htmlFor="isConfidential" className="text-sm">Mark as confidential (HR/Admin only)</label>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => setShowAddDocument(false)}>
                        Cancel
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={() => addDocument.mutate(documentForm)}
                        disabled={!documentForm.documentName || addDocument.isPending}
                      >
                        {addDocument.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Document"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {documentsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : documents && documents.length > 0 ? (
                <div className="border rounded-lg divide-y">
                  {documents.map((doc) => {
                    const typeInfo = DOCUMENT_TYPE_LABELS[doc.documentType] || { label: doc.documentType, icon: "📄" };
                    const statusInfo = DOCUMENT_STATUS_LABELS[doc.status] || { label: doc.status, color: "bg-gray-100" };
                    return (
                      <div key={doc.id} className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{typeInfo.icon}</span>
                            <div>
                              <div className="font-medium">{doc.documentName}</div>
                              <div className="text-xs text-muted-foreground">{typeInfo.label}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {doc.isConfidential && (
                              <Badge variant="outline" className="text-xs">
                                <Lock className="h-3 w-3 mr-1" />
                                Confidential
                              </Badge>
                            )}
                            <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          {doc.issuedDate && (
                            <span>Issued: {format(new Date(doc.issuedDate), "MMM d, yyyy")}</span>
                          )}
                          {doc.expiryDate && (
                            <span className={doc.isExpired ? "text-red-500" : ""}>
                              Expires: {format(new Date(doc.expiryDate), "MMM d, yyyy")}
                            </span>
                          )}
                          <span>Added: {format(new Date(doc.createdAt), "MMM d, yyyy")}</span>
                          {doc.uploadedByName && <span>by {doc.uploadedByName}</span>}
                        </div>
                        {doc.description && (
                          <p className="text-sm text-muted-foreground mt-1">{doc.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No documents uploaded</p>
                  <p className="text-sm">Add tax forms, contracts, and other employee documents.</p>
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default function HRIQ() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("employees");
  const [showNewEmployee, setShowNewEmployee] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({ title: "", content: "", priority: "normal" });
  
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/hriq/dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/hriq/dashboard");
      return res.json();
    },
  });
  
  const { data: employees, isLoading: employeesLoading } = useQuery<Employee[]>({
    queryKey: ["/api/hriq/employees", statusFilter],
    queryFn: async () => {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await fetch(`/api/hriq/employees${params}`);
      return res.json();
    },
  });

  const { data: departments } = useQuery<DepartmentStat[]>({
    queryKey: ["/api/hriq/departments"],
    queryFn: async () => {
      const res = await fetch("/api/hriq/departments");
      return res.json();
    },
  });

  const { data: announcements } = useQuery<Announcement[]>({
    queryKey: ["/api/hriq/announcements"],
    queryFn: async () => {
      const res = await fetch("/api/hriq/announcements");
      return res.json();
    },
  });
  
  const { data: pendingTasks } = useQuery<Task[]>({
    queryKey: ["/api/hriq/tasks", "pending"],
    queryFn: async () => {
      const res = await fetch("/api/hriq/tasks?status=pending");
      return res.json();
    },
  });
  
  const { data: auditLog } = useQuery<AuditEntry[]>({
    queryKey: ["/api/hriq/audit"],
    queryFn: async () => {
      const res = await fetch("/api/hriq/audit?limit=10");
      return res.json();
    },
  });

  const [reportPeriod, setReportPeriod] = useState("30");
  
  const { data: reportsData, isLoading: reportsLoading } = useQuery<ReportsData>({
    queryKey: ["/api/hriq/reports", reportPeriod],
    queryFn: async () => {
      const res = await fetch(`/api/hriq/reports?period=${reportPeriod}`);
      return res.json();
    },
  });

  const { data: sheetsStatus } = useQuery<{ connected: boolean }>({
    queryKey: ["/api/hriq/sheets/status"],
    queryFn: async () => {
      const res = await fetch("/api/hriq/sheets/status");
      return res.json();
    },
  });

  const { data: spreadsheets, refetch: refetchSpreadsheets } = useQuery<{ spreadsheets: Array<{ id: string; name: string }> }>({
    queryKey: ["/api/hriq/sheets/list"],
    queryFn: async () => {
      const res = await fetch("/api/hriq/sheets/list");
      return res.json();
    },
    enabled: sheetsStatus?.connected === true,
  });

  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState("");
  const [newSheetName, setNewSheetName] = useState("");
  const [importMethod, setImportMethod] = useState<"excel" | "sheets">("excel");

  const createSheet = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest("POST", "/api/hriq/sheets/create", { title });
      return res.json();
    },
    onSuccess: () => {
      refetchSpreadsheets();
      setNewSheetName("");
    },
  });

  const exportToSheet = useMutation({
    mutationFn: async (spreadsheetId: string) => {
      const res = await apiRequest("POST", "/api/hriq/sheets/export", { spreadsheetId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/employees"] });
    },
  });

  const importFromSheet = useMutation({
    mutationFn: async (spreadsheetId: string) => {
      const res = await apiRequest("POST", "/api/hriq/sheets/import", { spreadsheetId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/dashboard"] });
    },
  });

  const uploadExcel = useMutation({
    mutationFn: async (file: File) => {
      const reader = new FileReader();
      const fileData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await apiRequest("POST", "/api/hriq/upload-excel", { 
        fileData, 
        fileName: file.name 
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/dashboard"] });
    },
  });

  const createAnnouncement = useMutation({
    mutationFn: async (data: typeof announcementForm) => {
      const res = await apiRequest("POST", "/api/hriq/announcements", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/announcements"] });
      setShowAnnouncement(false);
      setAnnouncementForm({ title: "", content: "", priority: "normal" });
    },
  });

  const handleExportCSV = () => {
    const params = new URLSearchParams();
    // Handle special __unassigned__ value for null departments
    if (departmentFilter !== "all") {
      params.set("department", departmentFilter === "__unassigned__" ? "" : departmentFilter);
    }
    if (statusFilter !== "all") params.set("status", statusFilter);
    window.open(`/api/hriq/export/employees?${params.toString()}`, "_blank");
  };
  
  const completeTask = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await apiRequest("POST", `/api/hriq/tasks/${taskId}/complete`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hriq/dashboard"] });
    }
  });
  
  const filteredEmployees = employees?.filter(e => {
    // Department filter - handle "__unassigned__" for null departments
    if (departmentFilter !== "all") {
      if (departmentFilter === "__unassigned__") {
        if (e.department) return false; // Has a department, exclude
      } else {
        if (e.department !== departmentFilter) return false;
      }
    }
    
    // Search filter
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      e.legalFirstName.toLowerCase().includes(search) ||
      e.legalLastName.toLowerCase().includes(search) ||
      e.employeeNumber.toLowerCase().includes(search) ||
      e.role?.toLowerCase().includes(search) ||
      e.department?.toLowerCase().includes(search) ||
      e.workEmail?.toLowerCase().includes(search) ||
      e.personalEmail?.toLowerCase().includes(search)
    );
  });
  
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard-home">
                <Button variant="ghost" size="icon" className="mr-2">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <img 
                src={remoteLeverageLogo} 
                alt="Remote Leverage" 
                className="h-10 w-10 rounded-lg object-cover"
              />
              <div>
                <h1 className="text-xl font-semibold">HRIQ</h1>
                <p className="text-sm text-muted-foreground">Employee Management System</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={() => setShowNewEmployee(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Employee
              </Button>
              <UserAvatarMenu 
                hriqActions={{
                  onExportCSV: handleExportCSV,
                  onAnnounce: () => setShowAnnouncement(true)
                }}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Total Employees"
            value={statsLoading ? "..." : stats?.totalEmployees || 0}
            icon={<Users className="h-5 w-5 text-muted-foreground" />}
            description="All employee records"
            onClick={() => { setActiveTab("employees"); setStatusFilter("all"); }}
          />
          <StatCard
            title="Active"
            value={statsLoading ? "..." : stats?.activeEmployees || 0}
            icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
            description="Currently employed"
            variant="success"
            onClick={() => { setActiveTab("employees"); setStatusFilter("active"); }}
          />
          <StatCard
            title="Onboarding"
            value={statsLoading ? "..." : stats?.onboardingInProgress || 0}
            icon={<UserPlus className="h-5 w-5 text-blue-600" />}
            description="In onboarding process"
            emptyMessage="No employees currently onboarding"
            onClick={() => { setActiveTab("employees"); setStatusFilter("onboarding"); }}
          />
          <StatCard
            title="Pending Tasks"
            value={statsLoading ? "..." : stats?.pendingTasks || 0}
            icon={<ClipboardList className="h-5 w-5 text-orange-600" />}
            description={stats?.overdueTasks ? `${stats.overdueTasks} overdue` : "Awaiting completion"}
            variant={(stats?.overdueTasks || 0) > 0 ? "danger" : (stats?.pendingTasks || 0) > 0 ? "warning" : "default"}
            onClick={() => setActiveTab("tasks")}
          />
        </div>

        {/* Attention Banner - Show if there are overdue tasks or pending items */}
        {!statsLoading && ((stats?.overdueTasks || 0) > 0 || (stats?.pendingTasks || 0) > 5) && (
          <Card className="mb-6 border-amber-300 dark:border-amber-700 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900">
                    <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="font-medium text-amber-900 dark:text-amber-100">
                      {(stats?.overdueTasks || 0) > 0 
                        ? `${stats?.pendingTasks} pending tasks — ${stats?.overdueTasks} overdue`
                        : `${stats?.pendingTasks} tasks need attention`
                      }
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      Review and complete tasks to keep employee records up to date
                    </p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  className="border-amber-300 hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900"
                  onClick={() => setActiveTab("tasks")}
                >
                  Review Tasks
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Department Headcount Summary */}
        {departments && departments.length > 0 && (() => {
          const maxCount = Math.max(...departments.map(d => d.count));
          const unassignedDept = departments.find(d => !d.department);
          const assignedDepts = departments.filter(d => d.department).sort((a, b) => b.count - a.count);
          const sortedDepts = unassignedDept ? [unassignedDept, ...assignedDepts] : assignedDepts;
          
          return (
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Department Headcount
                  </CardTitle>
                  {departmentFilter !== "all" && (
                    <Button variant="ghost" size="sm" onClick={() => setDepartmentFilter("all")}>
                      Clear filter
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {sortedDepts.map((dept) => {
                  const deptKey = dept.department || "__unassigned__";
                  const isActive = dept.department 
                    ? departmentFilter === dept.department 
                    : departmentFilter === "__unassigned__";
                  const isUnassigned = !dept.department;
                  const barWidth = maxCount > 0 ? (dept.count / maxCount) * 100 : 0;
                  
                  return (
                    <button
                      key={deptKey}
                      onClick={() => { 
                        setDepartmentFilter(isActive ? "all" : (dept.department || "__unassigned__")); 
                        setActiveTab("employees");
                      }}
                      className={`w-full text-left group transition-all rounded-lg p-2 -mx-2 ${
                        isActive ? "bg-primary/10" : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {isUnassigned && (
                            <AlertCircle className="h-4 w-4 text-amber-500" />
                          )}
                          <span className={`font-medium text-sm ${isUnassigned ? "text-amber-700 dark:text-amber-300" : ""}`}>
                            {dept.department || "Unassigned"}
                          </span>
                          {isUnassigned && dept.count > 10 && (
                            <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">
                              Needs attention
                            </Badge>
                          )}
                        </div>
                        <span className={`text-sm font-semibold ${isUnassigned ? "text-amber-600" : "text-muted-foreground"}`}>
                          {dept.count}
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all ${
                            isUnassigned 
                              ? "bg-amber-400" 
                              : isActive 
                                ? "bg-primary" 
                                : "bg-primary/60 group-hover:bg-primary/80"
                          }`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
                
                {unassignedDept && unassignedDept.count > 0 && (
                  <div className="pt-2 mt-2 border-t">
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="w-full border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950"
                      onClick={() => { setDepartmentFilter("__unassigned__"); setActiveTab("employees"); }}
                    >
                      <AlertCircle className="h-4 w-4 mr-2" />
                      Assign {unassignedDept.count} Employees to Departments
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* Active Announcements - sorted by priority */}
        {announcements && announcements.length > 0 && (() => {
          // Sort by priority: urgent > high > normal > low
          const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
          const sorted = [...announcements].sort((a, b) => 
            (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2) - 
            (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2)
          );
          const topAnnouncement = sorted[0];
          const isUrgent = topAnnouncement.priority === "urgent" || topAnnouncement.priority === "high";
          
          return (
            <Card className={`mb-6 ${isUrgent 
              ? "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20" 
              : "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20"
            }`}>
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <Megaphone className={`h-5 w-5 mt-0.5 ${isUrgent ? "text-red-600" : "text-amber-600"}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className={`font-medium ${isUrgent ? "text-red-900 dark:text-red-100" : "text-amber-900 dark:text-amber-100"}`}>
                        {topAnnouncement.title}
                      </h4>
                      {isUrgent && (
                        <Badge variant="destructive" className="text-xs">
                          {topAnnouncement.priority?.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    <p className={`text-sm mt-1 ${isUrgent ? "text-red-800 dark:text-red-200" : "text-amber-800 dark:text-amber-200"}`}>
                      {topAnnouncement.content}
                    </p>
                    <p className={`text-xs mt-2 ${isUrgent ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                      Posted by {topAnnouncement.authorName} • {format(new Date(topAnnouncement.publishedAt), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="h-auto p-1 bg-muted/50">
            <TabsTrigger value="employees" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:font-semibold px-4 py-2.5">
              <Users className="h-4 w-4" />
              Employees
            </TabsTrigger>
            <TabsTrigger value="hours" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:font-semibold px-4 py-2.5">
              <Timer className="h-4 w-4" />
              Hours Logged
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:font-semibold px-4 py-2.5 relative">
              <ClipboardList className="h-4 w-4" />
              Task Queue
              {(stats?.pendingTasks || 0) > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 text-xs">
                  {stats?.pendingTasks}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:font-semibold px-4 py-2.5">
              <History className="h-4 w-4" />
              Audit Log
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:font-semibold px-4 py-2.5">
              <BarChart3 className="h-4 w-4" />
              Reports
            </TabsTrigger>
            <TabsTrigger value="sheets" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:font-semibold px-4 py-2.5">
              <FileSpreadsheet className="h-4 w-4" />
              Sheets
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="employees">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Employee Directory</CardTitle>
                    <CardDescription>Manage all employee records and lifecycle</CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search employees..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 w-64"
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-44">
                        <Filter className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="pre_hire">Pre-Hire</SelectItem>
                        <SelectItem value="onboarding_scheduled">Onboarding Scheduled</SelectItem>
                        <SelectItem value="onboarding_in_progress">Onboarding</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="leave">On Leave</SelectItem>
                        <SelectItem value="termination_scheduled">Termination Scheduled</SelectItem>
                        <SelectItem value="offboarding_in_progress">Offboarding</SelectItem>
                        <SelectItem value="offboarded">Offboarded</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {employeesLoading ? (
                  <div className="p-8 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                  </div>
                ) : filteredEmployees?.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium">No employees found</p>
                    <p className="text-sm">Add your first employee to get started</p>
                    <Button className="mt-4" onClick={() => setShowNewEmployee(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Employee
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredEmployees?.map((employee) => (
                      <EmployeeRow 
                        key={employee.id} 
                        employee={employee}
                        onClick={() => setSelectedEmployee(employee)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="hours">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Timer className="h-5 w-5" />
                  Hours Logged Dashboard
                </CardTitle>
                <CardDescription>
                  Track daily hours against the 7h 15m target (Time Doctor integration)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="h-16 w-16 mx-auto mb-4 opacity-30" />
                  <h3 className="font-medium text-lg mb-2">Time Doctor Integration</h3>
                  <p className="text-sm max-w-md mx-auto">
                    This section will display hours logged from Time Doctor once the integration is configured.
                    Each employee needs a Time Doctor email linked to their profile.
                  </p>
                  <div className="mt-6 p-4 bg-muted/50 rounded-lg inline-block">
                    <p className="text-sm font-medium">Daily Target</p>
                    <p className="text-3xl font-bold text-primary">7h 15m</p>
                    <p className="text-xs text-muted-foreground mt-1">Required daily hours</p>
                  </div>
                  <div className="mt-6 grid grid-cols-3 gap-4 max-w-lg mx-auto">
                    <div className="p-3 rounded-lg border">
                      <p className="text-2xl font-bold text-green-600">--</p>
                      <p className="text-xs text-muted-foreground">Met Target</p>
                    </div>
                    <div className="p-3 rounded-lg border">
                      <p className="text-2xl font-bold text-amber-600">--</p>
                      <p className="text-xs text-muted-foreground">Below Target</p>
                    </div>
                    <div className="p-3 rounded-lg border">
                      <p className="text-2xl font-bold text-red-600">--</p>
                      <p className="text-xs text-muted-foreground">No Data</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="tasks">
            <Card>
              <CardHeader>
                <CardTitle>Pending Tasks</CardTitle>
                <CardDescription>Tasks awaiting completion across all employees</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {!pendingTasks || pendingTasks.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500 opacity-50" />
                    <p className="font-medium">All caught up!</p>
                    <p className="text-sm">No pending tasks at this time</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {pendingTasks.map((task) => (
                      <TaskRow 
                        key={task.id} 
                        task={task}
                        onComplete={() => completeTask.mutate(task.id)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="audit">
            <Card>
              <CardHeader>
                <CardTitle>Audit Log</CardTitle>
                <CardDescription>Complete history of all actions in the system</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {!auditLog || auditLog.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium">No activity yet</p>
                    <p className="text-sm">Actions will be logged here</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {auditLog.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between p-4">
                        <div>
                          <div className="font-medium text-sm">
                            {entry.action.replace(".", ": ").replace("_", " ")}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {entry.objectType} • {entry.actorType === "user" ? "User action" : "System"}
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {format(new Date(entry.timestamp), "MMM d, h:mm a")}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports">
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold">HR Reports</h3>
                  <p className="text-sm text-muted-foreground">New hires, terminations, and activity overview</p>
                </div>
                <Select value={reportPeriod} onValueChange={setReportPeriod}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                    <SelectItem value="365">Last year</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {reportsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : reportsData?.summary ? (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-6 text-center">
                        <div className="text-3xl font-bold text-green-600">{reportsData.summary.newHiresCount ?? 0}</div>
                        <p className="text-sm text-muted-foreground mt-1">New Hires</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6 text-center">
                        <div className="text-3xl font-bold text-red-600">{reportsData.summary.terminationsCount ?? 0}</div>
                        <p className="text-sm text-muted-foreground mt-1">Terminations</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6 text-center">
                        <div className="text-3xl font-bold text-primary">{reportsData.summary.totalActive ?? 0}</div>
                        <p className="text-sm text-muted-foreground mt-1">Total Active</p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <UserPlus className="h-4 w-4 text-green-600" />
                          New Hires ({reportsData.newHires.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        {reportsData.newHires.length === 0 ? (
                          <div className="p-6 text-center text-muted-foreground text-sm">
                            No new hires in this period
                          </div>
                        ) : (
                          <div className="divide-y max-h-[300px] overflow-auto">
                            {reportsData.newHires.map((hire) => (
                              <div key={hire.id} className="p-3 flex justify-between items-center">
                                <div>
                                  <div className="font-medium">{hire.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {hire.role || "No role"} • {hire.department || "No dept"}
                                  </div>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {hire.startDate ? format(new Date(hire.startDate), "MMM d") : "—"}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <UserMinus className="h-4 w-4 text-red-600" />
                          Terminations ({reportsData.terminations.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        {reportsData.terminations.length === 0 ? (
                          <div className="p-6 text-center text-muted-foreground text-sm">
                            No terminations in this period
                          </div>
                        ) : (
                          <div className="divide-y max-h-[300px] overflow-auto">
                            {reportsData.terminations.map((term) => (
                              <div key={term.id} className="p-3 flex justify-between items-center">
                                <div>
                                  <div className="font-medium">{term.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {term.role || "No role"} • {term.department || "No dept"}
                                  </div>
                                </div>
                                <Badge variant="outline" className="text-xs">
                                  {EMPLOYMENT_STATUS_LABELS[term.status]?.label || term.status}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Recent Activity</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      {reportsData.recentActivity.length === 0 ? (
                        <div className="p-6 text-center text-muted-foreground text-sm">
                          No recent activity
                        </div>
                      ) : (
                        <div className="divide-y max-h-[250px] overflow-auto">
                          {reportsData.recentActivity.slice(0, 15).map((activity) => (
                            <div key={activity.id} className="p-3 flex justify-between items-center">
                              <div>
                                <div className="text-sm font-medium">
                                  {activity.action.replace(".", ": ").replace("_", " ")}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {activity.objectType} • {activity.reason || "No reason provided"}
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {format(new Date(activity.timestamp), "MMM d, h:mm a")}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>No report data available</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="sheets">
            <div className="space-y-6">
              {/* Section 1: Page Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5" />
                    Import & Export Data
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Bulk manage employees without manual data entry. Import from spreadsheets or sync with Google Sheets.
                  </p>
                </div>
              </div>

              {/* Section 2: Choose Import/Export Method */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">How would you like to manage your data?</CardTitle>
                  <CardDescription>Pick the method that works best for your workflow</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      onClick={() => setImportMethod("excel")}
                      className={`text-left p-4 rounded-lg border-2 transition-all ${
                        importMethod === "excel" 
                          ? "border-primary bg-primary/5 shadow-sm" 
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${importMethod === "excel" ? "bg-primary/10" : "bg-muted"}`}>
                          <Upload className={`h-5 w-5 ${importMethod === "excel" ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium flex items-center gap-2">
                            Upload Excel File
                            <Badge variant="secondary" className="text-xs">Recommended</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            Import from .xlsx, .xls, or .csv files directly from your computer
                          </p>
                          <p className="text-xs text-primary mt-2">Preview and validate before importing</p>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => setImportMethod("sheets")}
                      className={`text-left p-4 rounded-lg border-2 transition-all ${
                        importMethod === "sheets" 
                          ? "border-primary bg-primary/5 shadow-sm" 
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${importMethod === "sheets" ? "bg-primary/10" : "bg-muted"}`}>
                          <FileSpreadsheet className={`h-5 w-5 ${importMethod === "sheets" ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">Google Sheets</div>
                          <p className="text-sm text-muted-foreground mt-1">
                            Two-way sync with Google Sheets for collaborative editing
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">Requires Google account connection</p>
                        </div>
                      </div>
                    </button>
                  </div>
                </CardContent>
              </Card>

              {/* Section 3a: Excel Upload (when Excel method selected) */}
              {importMethod === "excel" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      Import from Excel File
                    </CardTitle>
                    <CardDescription>
                      Upload a spreadsheet file to import employee data. New employees will be created, existing ones updated.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            uploadExcel.mutate(file);
                          }
                        }}
                        className="hidden"
                        id="excel-upload"
                      />
                      <label 
                        htmlFor="excel-upload" 
                        className="cursor-pointer flex flex-col items-center gap-3"
                      >
                        {uploadExcel.isPending ? (
                          <>
                            <Loader2 className="h-10 w-10 animate-spin text-primary" />
                            <span className="text-sm text-muted-foreground">Processing file...</span>
                          </>
                        ) : (
                          <>
                            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                              <FileSpreadsheet className="h-8 w-8 text-primary" />
                            </div>
                            <div>
                              <span className="text-sm font-medium">Click to select file or drag and drop</span>
                              <p className="text-xs text-muted-foreground mt-1">Supports Excel (.xlsx, .xls) and CSV files</p>
                            </div>
                          </>
                        )}
                      </label>
                    </div>
                    
                    {uploadExcel.isSuccess && uploadExcel.data && (
                      <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                        <p className="font-medium text-green-700 dark:text-green-300 flex items-center gap-2">
                          <Check className="h-4 w-4" />
                          Import Complete
                        </p>
                        <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                          {(uploadExcel.data as any).imported} new employees imported, {(uploadExcel.data as any).updated} existing records updated
                        </p>
                        {(uploadExcel.data as any).errors?.length > 0 && (
                          <p className="text-sm text-amber-600 mt-1">{(uploadExcel.data as any).errors.length} rows had errors and were skipped</p>
                        )}
                      </div>
                    )}
                    
                    {uploadExcel.isError && (
                      <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                        <p className="font-medium text-red-700 dark:text-red-300">Upload Failed</p>
                        <p className="text-sm text-red-600 dark:text-red-400 mt-1">{(uploadExcel.error as Error).message}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Section 3b: Google Sheets (when Sheets method selected) */}
              {importMethod === "sheets" && (
                <>
                  {!sheetsStatus?.connected ? (
                    <Card>
                      <CardContent className="pt-6 text-center">
                        <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-30" />
                        <h4 className="font-medium mb-2">Google Sheets Not Connected</h4>
                        <p className="text-sm text-muted-foreground mb-4">
                          Connect your Google account to enable spreadsheet sync.
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <>
                      {/* Select or Create Spreadsheet */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base">Select Spreadsheet</CardTitle>
                            <CardDescription>Paste a URL or choose from your sheets</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <Input
                              placeholder="https://docs.google.com/spreadsheets/d/..."
                              onChange={(e) => {
                                const url = e.target.value;
                                const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
                                if (match) {
                                  setSelectedSpreadsheet(match[1]);
                                }
                              }}
                            />
                            
                            <div className="relative">
                              <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t" />
                              </div>
                              <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-background px-2 text-muted-foreground">or</span>
                              </div>
                            </div>
                            
                            <Select value={selectedSpreadsheet} onValueChange={setSelectedSpreadsheet}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a spreadsheet" />
                              </SelectTrigger>
                              <SelectContent>
                                {spreadsheets?.spreadsheets?.map((sheet) => (
                                  <SelectItem key={sheet.id} value={sheet.id}>
                                    {sheet.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" onClick={() => refetchSpreadsheets()}>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Refresh
                              </Button>
                              {selectedSpreadsheet && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => window.open(`https://docs.google.com/spreadsheets/d/${selectedSpreadsheet}`, "_blank")}
                                >
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  Open
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base">Create New Spreadsheet</CardTitle>
                            <CardDescription>Create a new sheet for employee data</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <Input
                              placeholder="Spreadsheet name"
                              value={newSheetName}
                              onChange={(e) => setNewSheetName(e.target.value)}
                            />
                            <Button
                              onClick={() => createSheet.mutate(newSheetName || "HRIQ Employees")}
                              disabled={createSheet.isPending}
                              className="w-full"
                            >
                              {createSheet.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Plus className="h-4 w-4 mr-2" />
                              )}
                              Create Spreadsheet
                            </Button>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Sync Actions - Only show when sheet is selected */}
                      {selectedSpreadsheet && (
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                              Sync Actions
                              <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-1 rounded">
                                Sheet selected
                              </span>
                            </CardTitle>
                            <CardDescription>Export or import employee data</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="flex gap-3">
                              <Button
                                onClick={() => exportToSheet.mutate(selectedSpreadsheet)}
                                disabled={exportToSheet.isPending}
                                className="flex-1"
                              >
                                {exportToSheet.isPending ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Upload className="h-4 w-4 mr-2" />
                                )}
                                Export to Sheet
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => importFromSheet.mutate(selectedSpreadsheet)}
                                disabled={importFromSheet.isPending}
                                className="flex-1"
                              >
                                {importFromSheet.isPending ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Download className="h-4 w-4 mr-2" />
                                )}
                                Import from Sheet
                              </Button>
                            </div>

                            {(exportToSheet.isSuccess || importFromSheet.isSuccess) && (
                              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                                {exportToSheet.isSuccess && exportToSheet.data && (
                                  <p className="text-sm text-green-700 dark:text-green-300">
                                    Exported {(exportToSheet.data as any).rowsWritten} employees to the spreadsheet.
                                  </p>
                                )}
                                {importFromSheet.isSuccess && importFromSheet.data && (
                                  <p className="text-sm text-green-700 dark:text-green-300">
                                    Import complete: {(importFromSheet.data as any).imported} new, {(importFromSheet.data as any).updated} updated.
                                  </p>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      {/* Help Tips */}
                      <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                        <p className="font-medium mb-1">Tips:</p>
                        <ul className="space-y-0.5">
                          <li>• Export overwrites the spreadsheet with current data</li>
                          <li>• Import matches employees by Employee Number</li>
                          <li>• New employees in the sheet will be created as Active</li>
                        </ul>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
      
      <NewEmployeeDialog open={showNewEmployee} onOpenChange={setShowNewEmployee} />
      <EmployeeDetailDialog 
        employee={selectedEmployee} 
        open={!!selectedEmployee} 
        onOpenChange={(open) => !open && setSelectedEmployee(null)} 
      />

      {/* Announcement Dialog */}
      <Dialog open={showAnnouncement} onOpenChange={setShowAnnouncement}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              Create Announcement
            </DialogTitle>
            <DialogDescription>
              Post a company-wide announcement visible to all employees
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder="Announcement title"
                value={announcementForm.title}
                onChange={(e) => setAnnouncementForm(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <textarea
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Write your announcement..."
                value={announcementForm.content}
                onChange={(e) => setAnnouncementForm(prev => ({ ...prev, content: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select 
                value={announcementForm.priority} 
                onValueChange={(value) => setAnnouncementForm(prev => ({ ...prev, priority: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowAnnouncement(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => createAnnouncement.mutate(announcementForm)}
                disabled={!announcementForm.title || !announcementForm.content || createAnnouncement.isPending}
              >
                {createAnnouncement.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Post Announcement
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
