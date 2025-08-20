"use client";
import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // You could sync to context/localStorage here if you want.
      // For your current flow you already store a lightweight user in localStorage.
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return <>{children}</>;
}
