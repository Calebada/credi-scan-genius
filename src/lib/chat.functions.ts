import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callLovableAI } from "./ai.server";

const SYSTEM = `You are ACREDIA, the official assistant for CIT-U's ETEEAP credit evaluation portal.
Help applicants understand: the ETEEAP process, document requirements, how AI subject matching works
(green >=85 confidence = auto-credit, yellow 60-84 = evaluator review, red <60 = no credit), how to flag
disputed matches, and how the completion forecast is computed (21 units/semester, prereqs respected).
You CANNOT modify applications or make accreditation decisions. When asked about a specific decision,
say it is informational only. If unsure, suggest escalating to a human evaluator via the dashboard.
Keep answers concise and use markdown.`;

export const chat = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      conversationId: z.string().uuid().nullable(),
      message: z.string().min(1).max(2000),
      userId: z.string().uuid().nullable(),
      applicationId: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    let convId = data.conversationId;
    if (!convId) {
      const { data: c, error } = await supabaseAdmin
        .from("chat_conversations")
        .insert({ user_id: data.userId, session_key: crypto.randomUUID() })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      convId = c.id;
    }

    // Load history
    const { data: prior } = await supabaseAdmin
      .from("chat_messages")
      .select("role, content")
      .eq("conversation_id", convId)
      .order("created_at");

    // Optional app context
    let contextStr = "";
    if (data.applicationId) {
      const { data: app } = await supabaseAdmin
        .from("applications")
        .select("status, full_name, programs(code, name)")
        .eq("id", data.applicationId)
        .maybeSingle();
      if (app) contextStr = `\n\nUSER APPLICATION CONTEXT: status=${app.status}, program=${(app as any).programs?.code ?? "?"}.`;
    }

    await supabaseAdmin.from("chat_messages").insert({ conversation_id: convId, role: "user", content: data.message });

    const res = await callLovableAI({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM + contextStr },
        ...(prior ?? []).map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: data.message },
      ],
    });
    if (!res.ok) {
      if (res.status === 429) throw new Error("Too many requests. Please try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted. Please contact the administrator.");
      throw new Error(`AI gateway error: ${res.status}`);
    }
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const reply = j.choices?.[0]?.message?.content ?? "I'm sorry, I couldn't generate a response.";

    await supabaseAdmin.from("chat_messages").insert({ conversation_id: convId, role: "assistant", content: reply });

    return { conversationId: convId, reply };
  });
