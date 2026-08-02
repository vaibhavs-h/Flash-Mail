import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const cleanUsername = username.toLowerCase().trim();

    const { data: emails, error } = await supabaseAdmin
      .from("emails")
      .select("id, recipient, username, sender, subject, text_body, html_body, created_at, expires_at")
      .eq("username", cleanUsername)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[API Error] Failed to fetch emails:", error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, emails: emails || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
