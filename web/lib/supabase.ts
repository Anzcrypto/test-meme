import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

export type Reaction = { emoji: string; count: number };

export type Message = {
  id: number;
  channel_id: number;
  channel_name: string | null;
  message_id: number;
  text: string | null;
  date: string;
  reactions_count: number;
  reactions: Reaction[];
  media_type: "photo" | "video" | "document" | null;
  link: string | null;
};
