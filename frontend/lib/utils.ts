import { clsx, type ClassValue } from 'clsx'
import { customAlphabet } from 'nanoid'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
//checking if branch protection working
export const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  7
) // 7-character random string

export async function fetcher<JSON = any>(
  input: RequestInfo,
  init?: RequestInit
): Promise<JSON> {
  const res = await fetch(input, init)

  if (!res.ok) {
    const json = await res.json()
    if (json.error) {
      const error = new Error(json.error) as Error & {
        status: number
      }
      error.status = res.status
      throw error
    } else {
      throw new Error('An unexpected error occurred')
    }
  }

  return res.json()
}

export function formatDate(input: string | number | Date): string {
  const date = new Date(input)
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

export async function authenticateUser(userData: {
  email_id: string;
  first_name: string;
  last_name: string;
  partner: string;
}): Promise<{ back_auth: string; userid: string }> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/v1/user/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      throw new Error("status: " + response.status);
    }

    const back_auth = response.headers.get('x-auth-token') || '';
    const userid = await response.text();

    // Throw error if we don't get a valid token
    if (!back_auth || back_auth.trim() === '') {
      throw new Error('No authentication token received from server');
    }

    return { back_auth, userid };
  } catch (error) {
    throw error;
  }
}
