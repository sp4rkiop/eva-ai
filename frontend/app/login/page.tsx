"use client";
import { signIn, useSession } from "next-auth/react";
import { IconGitHub, IconGoogle, IconEva } from '@/components/ui/icons';
import { redirect } from "next/navigation";
import { motion } from "framer-motion";

export default function Login() {
  const { data: session, status } = useSession();
  if (status === "authenticated") {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-500 to-indigo-700 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-4xl bg-white/90 dark:bg-gray-800/90 backdrop-blur-lg rounded-2xl shadow-xl overflow-hidden grid md:grid-cols-2"
      >
        {/* Left Section - Branding & Features */}
        <div className="hidden md:flex flex-col justify-center p-12 bg-gradient-to-br from-purple-500 to-blue-500 text-white dark:from-gray-900 dark:to-gray-800">
          <div className="mb-8">
            <div className="flex items-center mb-6">
              <IconEva className="h-16 w-16 text-white/90" />
              <h1 className="ml-3 text-4xl font-bold tracking-tight">Eva</h1>
            </div>
            <p className="text-lg mb-6 opacity-90">
              Your Intelligent Conversation Partner
            </p>
          </div>

          <div className="space-y-5">
            <div className="flex items-center space-x-4">
              <div className="p-2 bg-white/10 rounded-full">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold">Smart Responses</h3>
                <p className="text-sm opacity-90">AI-powered contextual conversations</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="p-2 bg-white/10 rounded-full">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold">Secure & Private</h3>
                <p className="text-sm opacity-90">Enterprise-grade data protection</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="p-2 bg-white/10 rounded-full">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold">Cross-Platform</h3>
                <p className="text-sm opacity-90">Seamless sync across devices</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Section - Login Form */}
        <div className="p-12 dark:text-white">
          <div className="text-center mb-10">
            {/* Mobile-only heading */}
            <h2 className="text-3xl font-bold mb-2 md:hidden">Eva</h2>
            {/* Desktop-only heading */}
            <h2 className="text-3xl font-bold mb-2 hidden md:block">Welcome Back</h2>
            <p className="text-gray-600 dark:text-gray-300">
              Sign in to continue your AI conversation journey
            </p>
          </div>

          <div className="space-y-6">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => signIn("google")}
              className="w-full flex items-center justify-center space-x-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-white px-6 py-4 rounded-xl transition-all duration-200"
            >
              <IconGoogle className="w-6 h-6" />
              <span>Continue with Google</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => signIn("github")}
              className="w-full flex items-center justify-center space-x-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-white px-6 py-4 rounded-xl transition-all duration-200"
            >
              <IconGitHub className="w-6 h-6" />
              <span>Continue with GitHub</span>
            </motion.button>
          </div>

          <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
            By continuing, you agree to our
            <a href="https://github.com/SP4RKiOP/eva-ai#license" className="text-purple-600 dark:text-purple-400 hover:underline ml-1">
              License
            </a> 
            {/* and 
            <a href="#" className="text-purple-600 dark:text-purple-400 hover:underline ml-1">
              Privacy Policy
            </a> */}
          </div>
        </div>
      </motion.div>
    </div>
  );
}