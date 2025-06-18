'use client';
import { useInView } from 'react-intersection-observer';
import { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, Users, Bot, BarChart4, Search, Trash2, Plus, Menu, X, User, ChevronDown, } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination, PaginationContent, PaginationItem, } from '@/components/ui/pagination';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSession } from 'next-auth/react';
import { toast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';
import { authenticateUser } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Checkbox } from '@/components/ui/checkbox';


// Extend next-auth session type to include custom properties
declare module "next-auth" {
  interface Session {
    partner?: string;
    userid: string;
    back_auth: string;
  }
}

interface User {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  partner: string;
  chat_count: number;
  total_tokens: number;
  latest_activity: string | null;
  models_sub: {
    model_id: string;
    model_name: string;
    provider: string;
  }[];
}

interface UsersData {
  page_size: number;
  users: User[];
  next_cursor: string | null;
  prev_cursor: string | null;
}

interface Model {
  model_id: string;
  model_name: string;
  provider: string;
  is_active: boolean;
  model_type: string;
  deployment_name: string;
  api_key: string;
  endpoint: string;
  model_version: string;
}
interface ModelsData {
  page_size: number;
  models: Model[];
  next_cursor: string | null;
  prev_cursor: string | null;
}

const chartConfig = {
  tokens_used: {
    label: "Tokens Consumption",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig

// ── Model edit form schema ───────────────────────────────────────────
const modelSchema = z.object({
  model_name: z.string().min(1),
  provider: z.string().min(1),
  model_type: z.string().min(1),
  deployment_name: z.string().optional(),
  api_key: z.string().optional(),
  endpoint: z.string().optional(),
  model_version: z.string().optional(),
  is_active: z.boolean(),
});

type ModelFormData = z.infer<typeof modelSchema>;

function EditableModelForm({
  model,
  isAdding,
  onSave,
}: {
  model: ModelFormData;
  isAdding: boolean;
  onSave: (data: ModelFormData) => void;
}) {
  const form = useForm<ModelFormData>({
    resolver: zodResolver(modelSchema),
    defaultValues: model,
    mode: "onChange",
  });

  useEffect(() => {
    form.reset(model);                 // reset when a new model is passed
  }, [model, form]);

  /* Show button:
     • ADD mode → all required fields valid
     • EDIT mode → something changed (dirty)           */
  const canSave = isAdding ? form.formState.isValid : form.formState.isDirty;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => {
          onSave(values);
          if (isAdding) form.reset(values);      // optional: clear dirty flag
        })}
        className="flex flex-wrap items-end gap-4"
      >
        {Object.keys(model).map((key) => (
          <FormField
            key={key}
            name={key as keyof ModelFormData}
            control={form.control}
            render={({ field }) => (
              <FormItem className="w-64">
                <FormLabel className="capitalize">
                  {key.replace(/_/g, " ")}
                </FormLabel>
                <FormControl>
                  {key === 'is_active' ? (
                    <div className="flex items-center space-x-2 h-10">
                      <Checkbox
                        checked={!!field.value}
                        onCheckedChange={field.onChange}
                        id="is_active"
                      />
                      <label htmlFor={`${key}-checkbox`} className="text-sm">
                        {field.value ? 'Active' : 'Inactive'}
                      </label>
                    </div>
                  ) : (
                    <Input
                      {...field}
                      value={field.value as string || ''}
                    />
                  )}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
        {canSave && (
          <Button type="submit" className="h-10 mt-6">
            Save
          </Button>
        )}
      </form>
    </Form>
  );
}

function getTimeElapsed(lastActive: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - lastActive.getTime()) / 1000);

  const units = [
    { name: 'year', seconds: 31536000 },
    { name: 'month', seconds: 2592000 },
    { name: 'day', seconds: 86400 },
    { name: 'hour', seconds: 3600 },
    { name: 'minute', seconds: 60 },
    { name: 'second', seconds: 1 },
  ];

  for (const unit of units) {
    const count = Math.floor(diffInSeconds / unit.seconds);
    if (count > 0) {
      return `${count} ${unit.name}${count > 1 ? 's' : ''} ago`;
    }
  }
  return 'just now';
}

// JWT Decoding and Validation Utilities
const decodeJWT = (token: string) => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Invalid JWT token:', error);
    return null;
  }
};

const isTokenExpired = (token: string): boolean => {
  // Return true for empty/invalid tokens
  if (!token || token.trim() === '') return true;

  const decoded = decodeJWT(token);
  if (!decoded?.exp) return true;

  const currentTime = Math.floor(Date.now() / 1000);
  return decoded.exp < currentTime;
};

export default function AdminDashboard() {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const [isInitialized, setIsInitialized] = useState(false);
  const isRefreshing = useRef(false); // Add ref to track refresh state
  const refreshingSession = useRef(false);
  const refreshTryCount = useRef(0);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [timeRange, setTimeRange] = useState("90d")
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedModel, setSelectedModel] = useState<any>(null);
  const [addingModel, setAddingModel] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // ── Backend data ─────────────────────────────────────────────────────────────
  const [totalUsers, setTotalUsers] = useState(0);
  const [activeModels, setActiveModels] = useState(0);
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [users_data, setUsers] = useState<UsersData>({ page_size: 0, users: [], next_cursor: null, prev_cursor: null });
  const [models_data, setModels] = useState<ModelsData>({ page_size: 0, models: [], next_cursor: null, prev_cursor: null });
  const pageSize = 5;
  // Visibility sentinels (triggerOnce = true → only first time in view)
  const [usersRef, usersInView] = useInView({ triggerOnce: true, rootMargin: '200px' });
  const [modelsRef, modelsInView] = useInView({ triggerOnce: true, rootMargin: '200px' });
  // Stats calculations
  const totalTokens = chartData.reduce((sum, day) => sum + day.tokens_used, 0);
  const avgTokens = chartData.length
    ? Math.round(totalTokens / chartData.length)
    : 0;

  const filteredData = chartData.filter((item) => {
    const date = new Date(item.date)
    const referenceDate = new Date()
    let daysToSubtract = 90
    if (timeRange === "30d") {
      daysToSubtract = 30
    } else if (timeRange === "7d") {
      daysToSubtract = 7
    }
    const startDate = new Date(referenceDate)
    startDate.setDate(startDate.getDate() - daysToSubtract)
    return date >= startDate
  })

  const refreshToken = async () => {
    if (refreshingSession.current || refreshTryCount.current >= 2) return;
    try {
      refreshingSession.current = true;
      refreshTryCount.current += 1;
      const [fstNam, lstNam] = session?.user?.name?.split(' ') ?? ['', ''];
      const userData = {
        email_id: session?.user?.email || 'noemail@eva',
        first_name: fstNam,
        last_name: lstNam,
        partner: session?.partner || 'Eva',
      };

      const { back_auth, userid } = await authenticateUser(userData);

      // Throw error if we don't get a valid token
      if (!back_auth || back_auth.trim() === '') {
        throw new Error('No authentication token received from server');
      }

      await update({ back_auth, userid });
    } finally {
      refreshingSession.current = false;
    }
  }
  const fetchHomeData = async () => {
    if (!session?.back_auth) return;
    isRefreshing.current = true;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/v1/analytics/home`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.back_auth}`,
          },
        }
      );

      // ── Handle responses ───────────────────────────────────────────────────
      if (res.status === 401) {
        toast({
          variant: 'destructive',
          title: 'Session expired',
          description: 'Refreshing session.',
          duration: 3000,
        });
        await refreshToken();
      } else if (res.status === 200) {
        const data = await res.json();

        // 🔄 Update state with backend payload
        setTotalUsers(data.total_users ?? 0);
        setActiveModels(data.active_models ?? 0);
        setRecentUsers(data.recent_users ?? []);
        setChartData(data.usage_chat ?? []);
        setIsInitialized(true);
      } else {
        throw new Error(`Unexpected status code ${res.status}`);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Network error',
        description:
          error instanceof Error
            ? error.message
            : 'Unable to retrieve analytics.',
        duration: 3000,
      });
    } finally {
      isRefreshing.current = false;
    }
  };

  const fetchUsers = async (limit: number, query: string = '', cursor: string = '') => {
    if (!session?.back_auth) return;

    // build the query string
    const params = new URLSearchParams({ page_size: String(limit) });
    params.append('query', query);
    params.append('cursor', cursor);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/v1/analytics/users?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.back_auth}`,
          },
        }
      );

      // ── Handle responses ───────────────────────────────────────────────────
      if (res.status === 401) {
        toast({
          variant: 'destructive',
          title: 'Session expired',
          description: 'Refreshing session.',
          duration: 3000,
        });
        await refreshToken();
      } else if (res.status === 200) {
        const data = await res.json();
        setSelectedUser(null);
        setUsers(data);
      } else {
        throw new Error(`Unexpected status code ${res.status}`);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Network error',
        description:
          error instanceof Error
            ? error.message
            : 'Unable to retrieve analytics.',
        duration: 3000,
      });
    }
  };
  const modifyUser = async (user_id: string, payload: {}) => {
    if (!session?.back_auth) return;

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/v1/analytics/users/${user_id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.back_auth}`,
          },
          body: JSON.stringify(payload),
        }
      );

      // ── Handle responses ───────────────────────────────────────────────────
      if (res.status === 401) {
        toast({
          variant: 'destructive',
          title: 'Session expired',
          description: 'Refreshing session.',
          duration: 3000,
        });
        await refreshToken();
      } else if (res.status === 200) {
        setSelectedUser(null);
        fetchUsers(pageSize, '', '');
        toast({
          variant: 'default',
          title: 'Success',
          description: 'User data updated successfully.',
          duration: 3000,
        })
      } else {
        throw new Error(`Unexpected status code ${res.status}`);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Network error',
        description:
          error instanceof Error
            ? error.message
            : 'Unable to retrieve analytics.',
        duration: 3000,
      });
    }
  };

  const deleteUser = async (user_id: string) => {
    if (!session?.back_auth) return;

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/v1/analytics/users/${user_id}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.back_auth}`,
          },
        }
      );

      // ── Handle responses ───────────────────────────────────────────────────
      if (res.status === 401) {
        toast({
          variant: 'destructive',
          title: 'Session expired',
          description: 'Refreshing session.',
          duration: 3000,
        });
        await refreshToken();
      } else if (res.status === 204) {
        toast({
          variant: 'default',
          title: 'Success',
          description: `User deleted successfully.`,
          duration: 3000,
        })
        fetchUsers(pageSize, '', '');
        setSelectedUser(null);
      } else {
        throw new Error(`Unexpected status code ${res.status}`);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Network error',
        description:
          error instanceof Error
            ? error.message
            : 'Unable to retrieve analytics.',
        duration: 3000,
      });
    }
  };

  const fetchModels = async (limit: number, query: string = '', cursor: string = '') => {
    if (!session?.back_auth) return;

    // build the query string
    const params = new URLSearchParams({ page_size: String(limit) });
    params.append('query', query);
    params.append('cursor', cursor);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/v1/analytics/models?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.back_auth}`,
          },
        }
      );

      // ── Handle responses ───────────────────────────────────────────────────
      if (res.status === 401) {
        toast({
          variant: 'destructive',
          title: 'Session expired',
          description: 'Refreshing session.',
          duration: 3000,
        });
        await refreshToken();
      } else if (res.status === 200) {
        const data = await res.json();
        setSelectedModel(null);
        setModels(data);
      } else {
        throw new Error(`Unexpected status code ${res.status}`);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Network error',
        description:
          error instanceof Error
            ? error.message
            : 'Unable to retrieve analytics.',
        duration: 3000,
      });
    }
  };

  const addModel = async (payload: ModelFormData) => {
    if (!session?.back_auth) return;

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/v1/analytics/models`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.back_auth}`,
          },
        }
      );

      // ── Handle responses ───────────────────────────────────────────────────
      if (res.status === 401) {
        toast({
          variant: 'destructive',
          title: 'Session expired',
          description: 'Refreshing session.',
          duration: 3000,
        });
        await refreshToken();
      } else if (res.status === 200) {
        toast({
          variant: 'default',
          title: 'Success',
          description: `Model added successfully: ${await res.text()}`,
          duration: 3000,
        })
        fetchModels(pageSize, '', '');
      } else {
        throw new Error(`Unexpected status code ${res.status}`);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Network error',
        description:
          error instanceof Error
            ? error.message
            : 'Unable to retrieve analytics.',
        duration: 3000,
      });
    }
  };

  const deleteModel = async (model_id: string) => {
    if (!session?.back_auth) return;

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/v1/analytics/models/${model_id}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.back_auth}`,
          },
        }
      );

      // ── Handle responses ───────────────────────────────────────────────────
      if (res.status === 401) {
        toast({
          variant: 'destructive',
          title: 'Session expired',
          description: 'Refreshing session.',
          duration: 3000,
        });
        await refreshToken();
      } else if (res.status === 204) {
        toast({
          variant: 'default',
          title: 'Success',
          description: `Model deleted successfully.`,
          duration: 3000,
        })
        setSelectedModel(null);
        fetchModels(pageSize, '', '');
      } else {
        throw new Error(`Unexpected status code ${res.status}`);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Network error',
        description:
          error instanceof Error
            ? error.message
            : 'Unable to retrieve analytics.',
        duration: 3000,
      });
    }
  };

  const modifyModel = async (model_id: string, payload: {}) => {
    if (!session?.back_auth) return;

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/v1/analytics/models/${model_id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.back_auth}`,
          },
          body: JSON.stringify(payload),
        }
      );

      // ── Handle responses ───────────────────────────────────────────────────
      if (res.status === 401) {
        toast({
          variant: 'destructive',
          title: 'Session expired',
          description: 'Refreshing session.',
          duration: 3000,
        });
        await refreshToken();
      } else if (res.status === 200) {
        fetchModels(pageSize, '', '');
      } else {
        throw new Error(`Unexpected status code ${res.status}`);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Network error',
        description:
          error instanceof Error
            ? error.message
            : 'Unable to retrieve analytics.',
        duration: 3000,
      });
    }
  };

  // Redirect unauthenticated users
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Initialize analytics service when authenticated
  useEffect(() => {
    const initService = async () => {
      if (!session || status !== 'authenticated' || isRefreshing.current) return;

      try {
        isRefreshing.current = true;
        let currentAuth = session.back_auth;
        let currentUserId = session.userid;

        // Refresh token if expired
        if (!currentAuth || isTokenExpired(currentAuth)) {
          toast({
            description: "Token expired. Refreshing token...",
            duration: 1500
          });
          const [fstNam, lstNam] = session?.user?.name?.split(' ') ?? ['', ''];
          const userData = {
            email_id: session?.user?.email || 'noemail@eva',
            first_name: fstNam,
            last_name: lstNam,
            partner: session?.partner || 'Eva',
          };

          const { back_auth, userid } = await authenticateUser(userData);

          // Throw error if we don't get a valid token
          if (!back_auth || back_auth.trim() === '') {
            throw new Error('No authentication token received from server');
          }

          await update({ back_auth, userid });
          currentAuth = back_auth;
          currentUserId = userid;
        }

        const decoded = decodeJWT(currentAuth);
        if (decoded.role !== 'admin') {
          setIsInitialized(false);
          router.push('/?error=unauthorized');
        } else {
          await fetchHomeData();
        }
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Authentication Failed",
          description: error instanceof Error ? error.message : "Token refresh failed",
          duration: 3000
        });
        router.push('/login?error=session_expired');
        throw error;
      } finally {
        isRefreshing.current = false;
      }
    };

    initService();
  }, [status, session]);
  // Detect mobile screens
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close sidebar when switching tabs on mobile
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [activeTab, isMobile]);

  useEffect(() => {
    if (usersInView && users_data.users.length === 0) {
      fetchUsers(pageSize);
    }
  }, [usersInView]);

  useEffect(() => {
    if (modelsInView && models_data.models.length === 0) {
      fetchModels(pageSize);
    }
  }, [modelsInView]);


  // Show loading state while checking auth status
  if (status === 'loading' || !isInitialized) {
    return <div className="fixed inset-0 flex items-center justify-center">
      <LoadingSpinner show={true} />
    </div>;
  }
  const [firstName, lastName] = session?.user?.name?.split(/\s+/) ?? ['', ''];

  return (
    <div className="flex h-screen">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 w-full border-b p-4 z-30 flex justify-between items-center sidebar-color">
        <div className="flex items-center">
          <Avatar className="mr-2 size-6 rounded-full">
            <AvatarImage src="/icon.svg" alt="Eva" />
            <AvatarFallback className="rounded-full">Eva</AvatarFallback>
          </Avatar>
          <h1 className="text-lg font-bold">Eva AI</h1>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Sidebar - Responsive */}
      <div className={`fixed md:relative inset-y-0 left-0 z-40 w-64 sidebar-color p-6 flex flex-col transform transition-transform duration-300 ease-in-out md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}>
        <div className="mb-10 flex flex-row items-center">
          <Avatar className="mr-2 size-8 rounded-full">
            <AvatarImage src="/icon.svg" alt="Eva" />
            <AvatarFallback className="rounded-full">Eva</AvatarFallback>
          </Avatar>
          <h1 className="text-xl font-bold">Eva AI</h1>
        </div>

        <nav className="flex-1">
          <ul className="space-y-2 font-medium">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
              { id: 'users', label: 'Users', icon: Users },
              { id: 'models', label: 'Models', icon: Bot },
            ].map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center w-full p-3 rounded-lg transition-colors ${activeTab === item.id
                    ? 'skeleton'
                    : 'hover-light-dark'
                    }`}
                >
                  <item.icon className="w-5 h-5 mr-3" />
                  <span>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-auto pt-6 border-t border-zinc-800">
          <div className="flex items-center gap-2 text-sm w-full">
            <Avatar className="h-8 w-8 rounded-full">
              <AvatarImage src={session?.user?.image || ''} alt={firstName} />
              <AvatarFallback className="rounded-full">{firstName[0]}{lastName[0]}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{firstName} {lastName}</span>
              <span className="text-muted-foreground truncate text-xs">
                {session?.user?.email || ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Backdrop for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto pt-16 md:p-8">
        {/* Dashboard View */}
        {activeTab === 'dashboard' && (
          <div className="p-4 md:p-0">
            <header className="mb-8">
              <h1 className="text-2xl md:text-3xl font-bold">Admin Dashboard</h1>
              <p className="text-sm md:text-base">Manage your Eva AI platform</p>
            </header>

            {/* Stats Overview */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium ">Total Users</CardTitle>
                  <Users className="h-4 w-4 " />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalUsers}</div>
                  {/* <p className="text-xs ">+12 from last month</p> */}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium ">Tokens Consumed</CardTitle>
                  <BarChart4 className="h-4 w-4 " />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(totalTokens / 1000).toFixed(1)}k</div>
                  {/* <p className="text-xs ">+18.2% from last week</p> */}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium ">Avg. Usage</CardTitle>
                  <BarChart4 className="h-4 w-4 " />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(avgTokens / 1000).toFixed(1)}k</div>
                  <p className="text-xs ">Tokens per day</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium ">Active Models</CardTitle>
                  <Bot className="h-4 w-4 " />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{activeModels}</div>
                  {/* <p className="text-xs ">2 in beta</p> */}
                </CardContent>
              </Card>
            </div>

            {/* Usage Chart */}
            <div className="flex flex-col lg:flex-row gap-4 mb-8">
              <Card className="flex-1">
                <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 flex-row">
                  <div className="grid flex-1 gap-1 text-center sm:text-left">
                    <CardTitle>Usage Chart</CardTitle>
                  </div>
                  <Select value={timeRange} onValueChange={setTimeRange}>
                    <SelectTrigger
                      className="w-[160px] rounded-lg sm:ml-auto"
                      aria-label="Select a value"
                    >
                      <SelectValue placeholder="Last 3 months" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="90d" className="rounded-lg">
                        Last 3 months
                      </SelectItem>
                      <SelectItem value="30d" className="rounded-lg">
                        Last 30 days
                      </SelectItem>
                      <SelectItem value="7d" className="rounded-lg">
                        Last 7 days
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
                  <ChartContainer
                    config={chartConfig}
                    className="aspect-auto h-[250px] w-full"
                  >
                    <AreaChart data={filteredData}>
                      <defs>
                        <linearGradient id="fillTokensUsed" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="5%"
                            stopColor="var(--color-tokens_used)"
                            stopOpacity={0.8}
                          />
                          <stop
                            offset="95%"
                            stopColor="var(--color-tokens_used)"
                            stopOpacity={0.1}
                          />
                        </linearGradient>
                        {/* <linearGradient id="fillMobile" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="5%"
                            stopColor="var(--color-mobile)"
                            stopOpacity={0.8}
                          />
                          <stop
                            offset="95%"
                            stopColor="var(--color-mobile)"
                            stopOpacity={0.1}
                          />
                        </linearGradient> */}
                      </defs>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        minTickGap={32}
                        tickFormatter={(value) => {
                          const date = new Date(value)
                          return date.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        }}
                      />
                      {/* <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                      /> */}
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            labelFormatter={(value) => {
                              return new Date(value).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })
                            }}
                            indicator="dot"
                          />
                        }
                      />
                      {/* <Area
                        dataKey="mobile"
                        type="natural"
                        fill="url(#fillMobile)"
                        stroke="var(--color-mobile)"
                        stackId="a"
                      /> */}
                      <Area
                        dataKey="tokens_used"
                        type="natural"
                        fill="url(#fillTokensUsed)"
                        stroke="var(--color-tokens_used)"
                        stackId="a"
                      />
                      <ChartLegend content={<ChartLegendContent />} />
                    </AreaChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>Latest user interactions</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {recentUsers.map((user) => (
                    <div key={user.user_id} className="flex items-start">
                      <div className="flex">
                        <Avatar className="mr-2 size-8 rounded-full">
                          {/* <AvatarImage src={user.image} /> */}
                          <AvatarFallback className="rounded-full">
                            {user.first_name?.charAt(0)}
                            {user.last_name?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="ml-3">
                          <p className="font-medium">{user.first_name} {user.last_name}</p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                      <div className="ml-auto self-center">
                        <p className="text-sm truncate">
                          {getTimeElapsed(new Date(user.last_active))}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Users Table */}
            <Card className="mb-8" ref={usersRef}>
              <CardHeader>
                <div className="flex flex-col md:flex-row justify-between gap-4 md:items-center">
                  <div>
                    <CardTitle>Users</CardTitle>
                  </div>
                  <div className="flex gap-2 flex-row">
                    <Input
                      placeholder="Search users..."
                      className="w-full"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      className="whitespace-nowrap"
                      onClick={() => fetchUsers(pageSize, userSearch)}
                    >
                      <Search className="w-4 h-4 mr-2" />
                      Search
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table className="overflow-x-auto">
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Partner</TableHead>
                      <TableHead>Last Active</TableHead>
                      <TableHead>Chats</TableHead>
                      <TableHead>Tokens</TableHead>
                      <TableHead>Models</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users_data.users.map((user) => (
                      <TableRow key={user.user_id}>
                        <TableCell>
                          <div className="font-medium">{user.first_name} {user.last_name}</div>
                          <div className="text-sm ">{user.email}</div>
                        </TableCell>
                        <TableCell className="capitalize">{user.partner.split('-')[0]}</TableCell>
                        <TableCell className="truncate">{user.latest_activity ? getTimeElapsed(new Date(user.latest_activity)) : 'N/A'}</TableCell>
                        <TableCell>{user.chat_count}</TableCell>
                        <TableCell>{(user.total_tokens / 1000).toFixed(1)}k</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.models_sub.map((model) => (
                              <Badge key={model.model_id} variant="outline" className="capitalize truncate" title={model.model_name}>
                                {model.model_name}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <Pagination className="mt-4">
                  <PaginationContent>
                    <PaginationItem>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!users_data.prev_cursor}
                        onClick={() => users_data.prev_cursor && fetchUsers(pageSize, "", users_data.prev_cursor)}
                      >
                        Previous
                      </Button>
                    </PaginationItem>
                    <PaginationItem>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!users_data.next_cursor}
                        onClick={() => users_data.next_cursor && fetchUsers(pageSize, "", users_data.next_cursor)}
                      >
                        Next
                      </Button>
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </CardContent>
            </Card>

            {/* Models Table */}
            <Card ref={modelsRef}>
              <CardHeader>
                <div className="flex flex-col md:flex-row justify-between gap-4 md:items-center">
                  <div>
                    <CardTitle>AI Models</CardTitle>
                  </div>
                  <div className="flex gap-2 flex-row">
                    <Input
                      placeholder="Search models..."
                      className="w-full"
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      className="whitespace-nowrap"
                      onClick={() => fetchModels(pageSize, modelSearch)}
                    >
                      <Search className="w-4 h-4 mr-2" />
                      Search
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table className="overflow-x-auto">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {models_data.models.map((model) => (
                      <TableRow key={model.model_id}>
                        <TableCell className="font-medium truncate capitalize">{model.model_name}</TableCell>
                        <TableCell className="capitalize">{model.provider}</TableCell>
                        <TableCell>
                          <Badge
                            className={`capitalize ${model.is_active === true ? 'bg-emerald-100 text-emerald-800' : 'bg-yellow-100 text-yellow-800'}`}
                          >
                            {model.is_active === true ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <Pagination className="mt-4">
                  <PaginationContent>
                    <PaginationItem>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!models_data.prev_cursor}
                        onClick={() => models_data.prev_cursor && fetchModels(pageSize, "", models_data.prev_cursor)}
                      >
                        Previous
                      </Button>
                    </PaginationItem>
                    <PaginationItem>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!models_data.next_cursor}
                        onClick={() => models_data.next_cursor && fetchModels(pageSize, "", models_data.next_cursor)}
                      >
                        Next
                      </Button>
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </CardContent>
            </Card>
          </div>
        )}
        {/* Users View */}
        {activeTab === 'users' && (
          <div className="p-4 md:p-0">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <h1 className="text-xl md:text-2xl font-bold">User Management</h1>
            </div>

            <Card ref={usersRef}>
              <CardHeader>
                <div className="flex flex-col md:flex-row justify-between gap-4 md:items-center">
                  <div>
                    <CardTitle>Users</CardTitle>
                  </div>
                  <div className="flex gap-2 flex-row">
                    <Input
                      placeholder="Search users..."
                      className="w-full"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      className="whitespace-nowrap"
                      onClick={() => fetchUsers(pageSize, userSearch)}
                    >
                      <Search className="w-4 h-4 mr-2" />
                      Search
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table className="overflow-x-auto">
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Partner</TableHead>
                      <TableHead>Last Active</TableHead>
                      <TableHead>Chats</TableHead>
                      <TableHead>Tokens</TableHead>
                      <TableHead>Models</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users_data.users.map((user) => (
                      <TableRow key={user.user_id}>
                        <TableCell>
                          <div className="font-medium ">{user.first_name} {user.last_name}</div>
                          <div className="text-sm ">{user.email}</div>
                        </TableCell>
                        <TableCell className="capitalize">{user.partner.split('-')[0]}</TableCell>
                        <TableCell className="truncate">{user.latest_activity ? getTimeElapsed(new Date(user.latest_activity)) : 'N/A'}</TableCell>
                        <TableCell>{user.chat_count}</TableCell>
                        <TableCell>{(user.total_tokens / 1000).toFixed(1)}k</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.models_sub.map(model => (
                              <Badge key={model.model_id} variant="outline" className="capitalize truncate" title={model.model_name}>
                                {model.model_name}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right justify-end">
                          <div className="flex justify-end">
                            <Button size="sm" variant="default"
                              onClick={() => setSelectedUser(user)}>
                              Details
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <Pagination className="mt-4">
                  <PaginationContent>
                    <PaginationItem>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!users_data.prev_cursor}
                        onClick={() => users_data.prev_cursor && fetchUsers(pageSize, "", users_data.prev_cursor)}
                      >
                        Previous
                      </Button>
                    </PaginationItem>
                    <PaginationItem>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!users_data.next_cursor}
                        onClick={() => users_data.next_cursor && fetchUsers(pageSize, "", users_data.next_cursor)}
                      >
                        Next
                      </Button>
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </CardContent>
            </Card>

            {/* User Detail View */}
            {selectedUser && (
              <div className="mt-8">
                <div className="flex flex-col md:flex-row justify-between gap-4 md:items-center mb-4">
                  <h2 className="text-lg md:text-xl font-bold">
                    {selectedUser.first_name} {selectedUser.last_name}'s Details
                  </h2>
                  <Button
                    variant="ghost"
                    onClick={() => setSelectedUser(null)}
                  >
                    Close
                  </Button>
                </div>

                <Card>
                  <CardHeader>
                    <div className="flex flex-row justify-between gap-4">
                      <div>
                        <CardTitle>{selectedUser.first_name} {selectedUser.last_name}</CardTitle>
                        <p className='text-sm'>{selectedUser.email}</p>
                      </div>
                      <Button variant="destructive" className="whitespace-nowrap"
                        onClick={() => {
                          deleteUser(selectedUser.user_id);
                        }}
                      >
                        <Trash2 className="mr-2" />
                        Delete User
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-6 flex flex-row justify-between">
                      <div>
                        <h3 className="font-medium mb-3">Subscribed Models</h3>
                        <div className="flex flex-wrap gap-2">
                          {selectedUser.models_sub.map((model: any) => (
                            <Badge
                              key={model.model_id}
                              variant="outline"
                              className="truncate capitalize"
                            >
                              {model.model_name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="whitespace-nowrap">
                            <Plus className="mr-2" />
                            Add Subscription
                            <ChevronDown className="ml-auto h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {models_data.models.filter(model => !selectedUser.models_sub.find((subModel: any) => subModel.model_id === model.model_id))
                            .map((model: any) => (
                              <DropdownMenuItem
                                className='truncate capitalize'
                                key={model.model_id}
                                onClick={() => modifyUser(selectedUser.user_id, { model_id: model.model_id })}
                              >
                                {model.model_name}
                              </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <h3 className="font-medium  mb-3">Change Role</h3>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-fit justify-start capitalize">
                          <User className="mr-2" />
                          {selectedUser.role}
                          <ChevronDown className="ml-auto h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => modifyUser(selectedUser.user_id, { role: 'user' })}>
                          User
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => modifyUser(selectedUser.user_id, { role: 'premium' })}>
                          Premium
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => modifyUser(selectedUser.user_id, { role: 'admin' })}>
                          Admin
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* Models View */}
        {activeTab === 'models' && (
          <div className="p-4 md:p-0">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <h1 className="text-xl md:text-2xl font-bold">AI Model Management</h1>
              <Button
                className="whitespace-nowrap self-end"
                onClick={() => {
                  setSelectedModel({      // blank values
                    model_name: "",
                    deployment_name: "",
                    model_type: "",
                    model_version: "",
                    provider: "",
                    api_key: "",
                    endpoint: "",
                    is_active: false
                  });
                  setAddingModel(true);    // flag “add” mode
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Model
              </Button>
            </div>

            <Card ref={modelsRef}>
              <CardHeader>
                <div className="flex flex-col md:flex-row justify-between gap-4 md:items-center">
                  <div>
                    <CardTitle>AI Models</CardTitle>
                  </div>
                  <div className="flex gap-2 flex-row">
                    <Input
                      placeholder="Search models..."
                      className="w-full"
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      className="whitespace-nowrap"
                      onClick={() => fetchModels(pageSize, modelSearch)}
                    >
                      <Search className="w-4 h-4 mr-2" />
                      Search
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table className="overflow-x-auto mt-4">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model Name</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {models_data.models.map((model) => (
                      <TableRow key={model.model_id}>
                        <TableCell className="font-medium truncate capitalize">{model.model_name}</TableCell>
                        <TableCell className="capitalize">{model.provider}</TableCell>
                        <TableCell>
                          <Badge
                            className={`capitalize ${model.is_active === true ? 'bg-emerald-100 text-emerald-800' : 'bg-yellow-100 text-yellow-800'}`}
                          >
                            {model.is_active === true ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right justify-end">
                          <div className="flex justify-end">
                            <Button size="sm" variant="default" className="mr-2"
                              onClick={() => setSelectedModel(model)}>
                              Edit
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <Pagination className="mt-4">
                  <PaginationContent>
                    <PaginationItem>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!models_data.prev_cursor}
                        onClick={() => models_data.prev_cursor && fetchModels(pageSize, "", models_data.prev_cursor)}
                      >
                        Previous
                      </Button>
                    </PaginationItem>
                    <PaginationItem>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!models_data.next_cursor}
                        onClick={() => models_data.next_cursor && fetchModels(pageSize, "", models_data.next_cursor)}
                      >
                        Next
                      </Button>
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </CardContent>
            </Card>

            {/* Model Detail View */}
            {selectedModel && (
              <div className="mt-8">
                <div className="flex flex-col md:flex-row justify-between gap-4 md:items-center mb-4">
                  <h2 className="text-lg md:text-xl font-bold truncate capitalize">
                    {selectedModel.model_name ? `${selectedModel.model_name}'s Details` : 'New Model'}
                  </h2>
                  <Button
                    variant="ghost"
                    onClick={() => { setSelectedModel(null); setAddingModel(false); }}
                  >
                    Close
                  </Button>
                </div>

                <Card>
                  <CardHeader>
                    <div className="flex flex-row justify-between gap-4">
                      <div>
                        <CardTitle className="truncate capitalize">{selectedModel.model_name}</CardTitle>
                        <p className='text-sm capitalize'>{selectedModel.provider}</p>
                      </div>
                      {selectedModel.model_name && (
                        <Button variant="destructive" className="whitespace-nowrap"
                          onClick={() => {
                            deleteModel(selectedModel.model_id);
                          }}
                        >
                          <Trash2 className="mr-2" />
                          Delete Model
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <EditableModelForm
                      model={selectedModel}
                      isAdding={addingModel}
                      onSave={(data) => {
                        addingModel ? addModel(data) : modifyModel(selectedModel.model_id, data);
                        setAddingModel(false);         // reset flag after save
                        setSelectedModel(null);        // close form if you like
                      }}
                    />
                  </CardContent>

                </Card>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}