"use client"
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Chat from '@/components/chat';
import { ChatService } from '@/lib/service';
import { useEffect, useMemo, useRef, useState } from 'react';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { useToast } from '@/components/ui/use-toast';
import { authenticateUser } from '@/lib/utils';

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
  // Return true for empty/invalid tokens
  if (!token || token.trim() === '') return true;

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
          chatService.authToken$.next(currentAuth);
          chatService.userId$.next(currentUserId);
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