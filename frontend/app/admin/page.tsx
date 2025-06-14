'use client';
import { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, Users, Bot, BarChart4, Search, Trash2, Plus, Menu, X, } from 'lucide-react';
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
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';

// Extend next-auth session type to include custom properties
declare module "next-auth" {
  interface Session {
    partner?: string;
    userid: string;
    back_auth: string;
  }
}

// Dummy data
const users = [
  {
    id: 1, name: 'Alex Johnson', email: 'alex@example.com', image: 'https://via.placeholder.com/150', lastActive: '2 hours ago', models: ['gpt-4', 'claude-2'], chats: 24, tokens: 12500, chatHistory: [
      { id: 'c1', title: 'API Integration Help', tokens: 3400, lastActivity: '2023-11-12' },
      { id: 'c2', title: 'Payment Issue', tokens: 5600, lastActivity: '2023-11-10' },
    ]
  },
  {
    id: 2, name: 'Sam Smith', email: 'sam@example.com', image: 'https://via.placeholder.com/150', lastActive: '1 day ago', models: ['gpt-3.5'], chats: 42, tokens: 28700, chatHistory: [
      { id: 'c1', title: 'API Integration Help', tokens: 3400, lastActivity: '2023-11-12' },
      { id: 'c2', title: 'Payment Issue', tokens: 5600, lastActivity: '2023-11-10' },
    ]
  },
  {
    id: 3, name: 'Taylor Brown', email: 'taylor@example.com', image: 'https://via.placeholder.com/150', lastActive: '3 days ago', models: ['llama-2', 'mistral'], chats: 18, tokens: 9600, chatHistory: [
      { id: 'c1', title: 'API Integration Help', tokens: 3400, lastActivity: '2023-11-12' },
      { id: 'c2', title: 'Payment Issue', tokens: 5600, lastActivity: '2023-11-10' },
    ]
  },
];

const models = [
  { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI', status: 'active', users: 142 },
  { id: 'claude-2', name: 'Claude 2', provider: 'Anthropic', status: 'active', users: 87 },
  { id: 'llama-2', name: 'Llama 2', provider: 'Meta', status: 'active', users: 65 },
  { id: 'mistral', name: 'Mistral', provider: 'Mistral AI', status: 'beta', users: 23 },
];

const chartData = [
  { date: "2024-04-01", desktop: 222, mobile: 150 },
  { date: "2024-04-02", desktop: 97, mobile: 180 },
  { date: "2024-04-03", desktop: 167, mobile: 120 },
  { date: "2024-04-04", desktop: 242, mobile: 260 },
  { date: "2024-04-05", desktop: 373, mobile: 290 },
  { date: "2024-04-06", desktop: 301, mobile: 340 },
  { date: "2024-04-07", desktop: 245, mobile: 180 },
  { date: "2024-04-08", desktop: 409, mobile: 320 },
  { date: "2024-04-09", desktop: 59, mobile: 110 },
  { date: "2024-04-10", desktop: 261, mobile: 190 },
  { date: "2024-04-11", desktop: 327, mobile: 350 },
  { date: "2024-04-12", desktop: 292, mobile: 210 },
  { date: "2024-04-13", desktop: 342, mobile: 380 },
  { date: "2024-04-14", desktop: 137, mobile: 220 },
  { date: "2024-04-15", desktop: 120, mobile: 170 },
  { date: "2024-04-16", desktop: 138, mobile: 190 },
  { date: "2024-04-17", desktop: 446, mobile: 360 },
  { date: "2024-04-18", desktop: 364, mobile: 410 },
  { date: "2024-04-19", desktop: 243, mobile: 180 },
  { date: "2024-04-20", desktop: 89, mobile: 150 },
  { date: "2024-04-21", desktop: 137, mobile: 200 },
  { date: "2024-04-22", desktop: 224, mobile: 170 },
  { date: "2024-04-23", desktop: 138, mobile: 230 },
  { date: "2024-04-24", desktop: 387, mobile: 290 },
  { date: "2024-04-25", desktop: 215, mobile: 250 },
  { date: "2024-04-26", desktop: 75, mobile: 130 },
  { date: "2024-04-27", desktop: 383, mobile: 420 },
  { date: "2024-04-28", desktop: 122, mobile: 180 },
  { date: "2024-04-29", desktop: 315, mobile: 240 },
  { date: "2024-04-30", desktop: 454, mobile: 380 },
  { date: "2024-05-01", desktop: 165, mobile: 220 },
  { date: "2024-05-02", desktop: 293, mobile: 310 },
  { date: "2024-05-03", desktop: 247, mobile: 190 },
  { date: "2024-05-04", desktop: 385, mobile: 420 },
  { date: "2024-05-05", desktop: 481, mobile: 390 },
  { date: "2024-05-06", desktop: 498, mobile: 520 },
  { date: "2024-05-07", desktop: 388, mobile: 300 },
  { date: "2024-05-08", desktop: 149, mobile: 210 },
  { date: "2024-05-09", desktop: 227, mobile: 180 },
  { date: "2024-05-10", desktop: 293, mobile: 330 },
  { date: "2024-05-11", desktop: 335, mobile: 270 },
  { date: "2024-05-12", desktop: 197, mobile: 240 },
  { date: "2024-05-13", desktop: 197, mobile: 160 },
  { date: "2024-05-14", desktop: 448, mobile: 490 },
  { date: "2024-05-15", desktop: 473, mobile: 380 },
  { date: "2024-05-16", desktop: 338, mobile: 400 },
  { date: "2024-05-17", desktop: 499, mobile: 420 },
  { date: "2024-05-18", desktop: 315, mobile: 350 },
  { date: "2024-05-19", desktop: 235, mobile: 180 },
  { date: "2024-05-20", desktop: 177, mobile: 230 },
  { date: "2024-05-21", desktop: 82, mobile: 140 },
  { date: "2024-05-22", desktop: 81, mobile: 120 },
  { date: "2024-05-23", desktop: 252, mobile: 290 },
  { date: "2024-05-24", desktop: 294, mobile: 220 },
  { date: "2024-05-25", desktop: 201, mobile: 250 },
  { date: "2024-05-26", desktop: 213, mobile: 170 },
  { date: "2024-05-27", desktop: 420, mobile: 460 },
  { date: "2024-05-28", desktop: 233, mobile: 190 },
  { date: "2024-05-29", desktop: 78, mobile: 130 },
  { date: "2024-05-30", desktop: 340, mobile: 280 },
  { date: "2024-05-31", desktop: 178, mobile: 230 },
  { date: "2024-06-01", desktop: 178, mobile: 200 },
  { date: "2024-06-02", desktop: 470, mobile: 410 },
  { date: "2024-06-03", desktop: 103, mobile: 160 },
  { date: "2024-06-04", desktop: 439, mobile: 380 },
  { date: "2024-06-05", desktop: 88, mobile: 140 },
  { date: "2024-06-06", desktop: 294, mobile: 250 },
  { date: "2024-06-07", desktop: 323, mobile: 370 },
  { date: "2024-06-08", desktop: 385, mobile: 320 },
  { date: "2024-06-09", desktop: 438, mobile: 480 },
  { date: "2024-06-10", desktop: 155, mobile: 200 },
  { date: "2024-06-11", desktop: 92, mobile: 150 },
  { date: "2024-06-12", desktop: 492, mobile: 420 },
  { date: "2024-06-13", desktop: 81, mobile: 130 },
  { date: "2024-06-14", desktop: 426, mobile: 380 },
  { date: "2024-06-15", desktop: 307, mobile: 350 },
  { date: "2024-06-16", desktop: 371, mobile: 310 },
  { date: "2024-06-17", desktop: 475, mobile: 520 },
  { date: "2024-06-18", desktop: 107, mobile: 170 },
  { date: "2024-06-19", desktop: 341, mobile: 290 },
  { date: "2024-06-20", desktop: 408, mobile: 450 },
  { date: "2024-06-21", desktop: 169, mobile: 210 },
  { date: "2024-06-22", desktop: 317, mobile: 270 },
  { date: "2024-06-23", desktop: 480, mobile: 530 },
  { date: "2024-06-24", desktop: 132, mobile: 180 },
  { date: "2024-06-25", desktop: 141, mobile: 190 },
  { date: "2024-06-26", desktop: 434, mobile: 380 },
  { date: "2024-06-27", desktop: 448, mobile: 490 },
  { date: "2024-06-28", desktop: 149, mobile: 200 },
  { date: "2024-06-29", desktop: 103, mobile: 160 },
  { date: "2024-06-30", desktop: 446, mobile: 400 },
]

const chartConfig = {
  visitors: {
    label: "Visitors",
  },
  desktop: {
    label: "Tokens Consumption",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig

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
  const [activeTab, setActiveTab] = useState('dashboard');
  const [timeRange, setTimeRange] = useState("90d")
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const itemsPerPage = 5;

  // Stats calculations
  const totalUsers = 243;
  const totalTokens = chartData.reduce((sum, day) => sum + day.desktop, 0);
  const avgTokens = Math.round(totalTokens / chartData.length);

  const filteredData = chartData.filter((item) => {
    const date = new Date(item.date)
    const referenceDate = new Date("2024-06-30")
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

  // Pagination logic
  const totalPages = Math.ceil(models.length / itemsPerPage);
  const currentModels = models.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  // Initialize chat service when authenticated
  useEffect(() => {
    const initializeChatService = async () => {
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
        // Set auth token and user ID -> init chat service
        if (currentAuth && currentUserId) {
          setIsInitialized(true);
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

    initializeChatService();
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
                  <p className="text-xs ">+12 from last month</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium ">Total Tokens</CardTitle>
                  <BarChart4 className="h-4 w-4 " />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(totalTokens / 1000).toFixed(1)}k</div>
                  <p className="text-xs ">+18.2% from last week</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium ">Avg. Usage</CardTitle>
                  <BarChart4 className="h-4 w-4 " />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(avgTokens / 1000).toFixed(1)}k</div>
                  <p className="text-xs ">per day</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium ">Active Models</CardTitle>
                  <Bot className="h-4 w-4 " />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{models.length}</div>
                  <p className="text-xs ">2 in beta</p>
                </CardContent>
              </Card>
            </div>

            {/* Usage Chart */}
            <div className="flex flex-col lg:flex-row gap-4 mb-8">
              <Card className="lg:w-2/3">
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
                        <linearGradient id="fillDesktop" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="5%"
                            stopColor="var(--color-desktop)"
                            stopOpacity={0.8}
                          />
                          <stop
                            offset="95%"
                            stopColor="var(--color-desktop)"
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
                        dataKey="desktop"
                        type="natural"
                        fill="url(#fillDesktop)"
                        stroke="var(--color-desktop)"
                        stackId="a"
                      />
                      <ChartLegend content={<ChartLegendContent />} />
                    </AreaChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card className="lg:w-1/3">
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>Latest user interactions</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {users.slice(0, 3).map((user) => (
                    <div key={user.id} className="flex items-start">
                      <Avatar className="mr-2 size-8 rounded-full">
                        <AvatarImage src={user.image} />
                        <AvatarFallback className="rounded-full">{user.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="ml-3">
                        <p className="font-medium">{user.name}</p>
                        <p className="text-sm ">
                          Started new chat · {user.lastActive}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Users Table */}
            <Card className="mb-8">
              <CardHeader>
                <div className="flex flex-col md:flex-row justify-between gap-4 md:items-center">
                  <div>
                    <CardTitle>Users</CardTitle>
                  </div>
                  <div className="flex gap-2 flex-row">
                    <Input placeholder="Search users..." className="w-full" />
                    <Button variant="outline" className="whitespace-nowrap">
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
                      <TableHead>Last Active</TableHead>
                      <TableHead>Chats</TableHead>
                      <TableHead>Tokens</TableHead>
                      <TableHead>Models</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="font-medium">{user.name}</div>
                          <div className="text-sm ">{user.email}</div>
                        </TableCell>
                        <TableCell className="truncate">{user.lastActive}</TableCell>
                        <TableCell>{user.chats}</TableCell>
                        <TableCell>{(user.tokens / 1000).toFixed(1)}k</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.models.map((model) => (
                              <Badge key={model} variant="outline">
                                {model}
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
                      <Button variant="outline" size="sm">
                        Previous
                      </Button>
                    </PaginationItem>
                    <PaginationItem>
                      <Button variant="outline" size="sm">
                        Next
                      </Button>
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </CardContent>
            </Card>

            {/* Models Table */}
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row justify-between gap-4 md:items-center">
                  <div>
                    <CardTitle>AI Models</CardTitle>
                  </div>
                  <div className="flex gap-2 flex-row">
                    <Input placeholder="Search models..." className="w-full" />
                    <Button variant="outline" className="whitespace-nowrap">
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
                      <TableHead>Users</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {models.map((model) => (
                      <TableRow key={model.id}>
                        <TableCell className="font-medium">{model.name}</TableCell>
                        <TableCell>{model.provider}</TableCell>
                        <TableCell>
                          <Badge
                            className={`capitalize ${model.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-yellow-100 text-yellow-800'}`}
                          >
                            {model.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{model.users}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
        {/* Users View */}
        {activeTab === 'users' && (
          <div className="p-4 md:p-0">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <h1 className="text-xl md:text-2xl font-bold">User Management</h1>
              <Button className="whitEditespace-nowrap self-end">
                <Plus className="w-4 h-4 mr-2" />
                Add User
              </Button>
            </div>

            <Card>
              <CardContent>
                <Table className="overflow-x-auto mt-4">
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Last Active</TableHead>
                      <TableHead>Chats</TableHead>
                      <TableHead>Tokens</TableHead>
                      <TableHead>Models</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="font-medium ">{user.name}</div>
                          <div className="text-sm ">{user.email}</div>
                        </TableCell>
                        <TableCell>{user.lastActive}</TableCell>
                        <TableCell>{user.chats}</TableCell>
                        <TableCell>{(user.tokens / 1000).toFixed(1)}k</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.models.map(model => (
                              <Badge
                                key={model}
                                variant="outline"
                              >
                                {model}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right justify-end">
                          <div className="flex justify-end">
                            <Button size="sm" variant="outline" className="mr-2"
                              onClick={() => setSelectedUser(user)}>
                              Details
                            </Button>
                            <Button size="sm" variant="destructive">
                              Remove
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
                      <Button variant="outline" size="sm">
                        Previous
                      </Button>
                    </PaginationItem>
                    <PaginationItem>
                      <Button variant="outline" size="sm">
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
                    {selectedUser.name}'s Details
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
                        <CardTitle>{selectedUser.name}</CardTitle>
                        <p className='text-sm'>{selectedUser.email}</p>
                      </div>
                      <Button variant="destructive" className="whitespace-nowrap">
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
                          {selectedUser.models.map((model: string) => (
                            <Badge
                              key={model}
                              variant="outline"
                            >
                              {model}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Button className="whitespace-nowrap">
                        <Plus className="mr-2" />
                        Add Model
                      </Button>
                    </div>

                    <h3 className="font-medium  mb-3">Chat History</h3>
                    <Table className="overflow-x-auto">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Chat Title</TableHead>
                          <TableHead>Tokens Used</TableHead>
                          <TableHead>Last Activity</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedUser.chatHistory.map((chat: any) => (
                          <TableRow key={chat.id}>
                            <TableCell className="font-medium ">
                              {chat.title}
                            </TableCell>
                            <TableCell className="">
                              {chat.tokens.toLocaleString()}
                            </TableCell>
                            <TableCell className="">
                              {chat.lastActivity}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
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
              <Button className="whitespace-nowrap self-end">
                <Plus className="w-4 h-4 mr-2" />
                Add Model
              </Button>
            </div>

            <Card >
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
                    {currentModels.map((model) => (
                      <TableRow key={model.id}>
                        <TableCell className="font-medium ">
                          {model.name}
                        </TableCell>
                        <TableCell className="">
                          {model.provider}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`capitalize ${model.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-yellow-100 text-yellow-800'}`}
                          >
                            {model.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right justify-end">
                          <div className="flex justify-end">
                            <Button size="sm" variant="outline" className="mr-2">
                              Edit
                            </Button>
                            <Button size="sm" variant="destructive">
                              Remove
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
                      <Button variant="outline" size="sm">
                        Previous
                      </Button>
                    </PaginationItem>
                    <PaginationItem>
                      <Button variant="outline" size="sm">
                        Next
                      </Button>
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}