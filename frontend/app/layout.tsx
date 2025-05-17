import { getServerSession } from "next-auth";
import { authOptions } from "./api/auth/[...nextauth]/auth";
import Provider from "./client-provider";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Inter } from "next/font/google"

export const metadata = {
  title: "Eva",
  description: "Abhishek Sinha @sp4rkiop",
  content:"width=device-width, initial-scale=1.0"
};

const inter = Inter({
  subsets: ["latin"],
})

export default async function RootLayout({children,
}: Readonly<{children: React.ReactNode;}>) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="en">
      <body className={inter.className}>
        <Provider session={session}>
          <main className="h-dvh">{children}</main>
          <Toaster />
          </Provider>
      </body>
    </html>
  );
}