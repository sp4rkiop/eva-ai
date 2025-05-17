"use client"
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Chat from '@/components/chat';
import { ChatService } from '@/lib/service';
import { useEffect, useMemo, useRef, useState } from 'react';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { useToast } from '@/components/ui/use-toast';

// Extend next-auth session type to include custom properties
declare module "next-auth" {
  interface Session {
    partner?: string;
    userid: string;
    back_auth: string;
  }
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
  const decoded = decodeJWT(token);
  if (!decoded?.exp) return true;
  
  const currentTime = Math.floor(Date.now() / 1000);
  return decoded.exp < currentTime;
};

export default function HomePage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const [isInitialized, setIsInitialized] = useState(false);
  const chatService = useMemo(() => ChatService.getInstance(), []);
  const isRefreshing = useRef(false); // Add ref to track refresh state
  const { toast } = useToast();

  const getuId_token = async (): Promise<[string, string]> => {
    try {
      const [fstNam, lstNam] = session?.user?.name?.split(' ') ?? ['', ''];
      const userData = {
        emailId: session?.user?.email,
        firstName: fstNam,
        lastName: lstNam,
        partner: session?.partner,
      };

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/Users/UserId`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(userData),
        }
      );

      if (!response.ok){
        toast({
          variant: "destructive",
          title: "Uh oh! Something went wrong.",
          description: "There was a problem refreshing your token. Code: " + response.status,
          duration: 1500
        });
      }
      
      const userid = await response.text();
      const back_auth = response.headers.get('authorization') || '';

      await update({
        back_auth,
        userid
      });

      return [back_auth, userid];
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Uh oh! Something went wrong.",
        description: "Token refresh failed:" + error as string,
        duration: 1500
      });
      // console.error("Token refresh failed:", error);
      router.push('/login?error=session_expired');
      return ["", ""];
    }
  };

  // Redirect unauthenticated users
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Initialize chat service when authenticated
  useEffect(() => {
    const initializeChatService = async () => {
      if (!session || status !== 'authenticated' || isRefreshing.current) return;

      try {
        isRefreshing.current = true;
        let currentAuth = session.back_auth;
        let currentUserId = session.userid;

        // Refresh token if expired
        if (currentAuth && isTokenExpired(currentAuth)) {
          toast({
            description: "Token expired. Refreshing token...",
            duration: 1500
          });
          [currentAuth, currentUserId] = await getuId_token();
        }
        if (currentAuth && currentUserId) {
          setIsInitialized(true);
          chatService.authToken$.next(currentAuth);
          chatService.userId$.next(currentUserId);
        }
      } finally {
        isRefreshing.current = false;
      }
    };

    initializeChatService();
  }, [status, session]);

  // Show loading state while checking auth status
  if (status === 'loading' || !isInitialized) {
    return <div className="fixed inset-0 flex items-center justify-center">
    <LoadingSpinner show={true} />
  </div>;
  }

  // Safely destructure user data with fallbacks
  const [firstName, lastName] = session?.user?.name?.split(/\s+/) ?? ['', ''];
  const userData = {
    email: session?.user?.email || '',
    image: session?.user?.image || '',
    partner: session?.partner || '',
    userid: session?.userid || '',
    back_auth: session?.back_auth || ''
  };
  return (
    <Chat
      fName={firstName}
      lName={lastName}
      uMail={userData.email}
      uImg={userData.image}
      partner={userData.partner}
      userid={userData.userid}
      back_auth={userData.back_auth}
      chatService={chatService}
    />
  );
}