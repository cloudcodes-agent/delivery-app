import { createClient } from "@supabase/supabase-js";

// Helper to resolve environment variables across different build tools (Vite, CRA, Next.js)
const getEnvVar = (key: string, viteKey: string, reactKey: string) => {
  if (
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env[viteKey]
  ) {
    return import.meta.env[viteKey];
  }
  if (typeof process !== "undefined" && process.env) {
    return process.env[key] || process.env[reactKey] || process.env[viteKey];
  }
  return "";
};

const supabaseUrl = getEnvVar(
  "NEXT_PUBLIC_SUPABASE_URL",
  "VITE_SUPABASE_URL",
  "REACT_APP_SUPABASE_URL",
);
const supabaseKey = getEnvVar(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "REACT_APP_SUPABASE_ANON_KEY",
);

if (!supabaseUrl || !supabaseKey)
  throw new Error("Missing Supabase environment variables");

export const supabase = createClient(supabaseUrl, supabaseKey);
