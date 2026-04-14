import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const body = await req.json()

    // Green API sends different webhook types
    const messageType = body.typeWebhook
    if (messageType !== "incomingMessageReceived") {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const messageData = body.messageData
    const senderData = body.senderData
    const phone = senderData?.chatId || senderData?.sender || ""
    const senderName = senderData?.senderName || senderData?.chatName || ""

    // Extract message text
    let messageText = ""
    let mediaType = "text"
    let mediaUrl = ""

    if (messageData?.typeMessage === "textMessage") {
      messageText = messageData.textMessageData?.textMessage || ""
    } else if (messageData?.typeMessage === "extendedTextMessage") {
      messageText = messageData.extendedTextMessageData?.text || ""
    } else if (messageData?.typeMessage === "imageMessage") {
      mediaType = "image"
      mediaUrl = messageData.fileMessageData?.downloadUrl || ""
      messageText = messageData.fileMessageData?.caption || ""
    } else if (messageData?.typeMessage === "audioMessage") {
      mediaType = "audio"
      mediaUrl = messageData.fileMessageData?.downloadUrl || ""
    } else if (messageData?.typeMessage === "videoMessage") {
      mediaType = "video"
      mediaUrl = messageData.fileMessageData?.downloadUrl || ""
      messageText = messageData.fileMessageData?.caption || ""
    }

    if (!phone) {
      return new Response(JSON.stringify({ ok: false, error: "no phone" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Init Supabase
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // Find or create client
    let { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("phone_number", phone)
      .single()

    if (!client) {
      const { data: newClient } = await supabase
        .from("clients")
        .insert({
          phone_number: phone,
          sender_name: senderName || phone.replace("@c.us", ""),
          current_state: "NEW",
          current_phase: "sales",
        })
        .select()
        .single()
      client = newClient
    }

    if (!client) {
      return new Response(JSON.stringify({ ok: false, error: "client creation failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Translate to Russian via Claude
    let messageTextRu = ""
    if (messageText && mediaType === "text") {
      try {
        const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey!,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1024,
            system: "Переведи с испанского на русский. Только перевод, ничего больше.",
            messages: [{ role: "user", content: messageText }],
          }),
        })
        const data = await res.json()
        messageTextRu = data.content?.[0]?.text || ""
      } catch (e) {
        console.error("Translation error:", e)
      }
    }

    // Save message
    await supabase.from("conversations").insert({
      client_id: client.id,
      direction: "in",
      message_text: messageText,
      message_text_ru: messageTextRu,
      media_type: mediaType,
      media_url: mediaUrl,
      sender: "client",
      state_at_time: client.current_state,
    })

    // Update last_message_at
    await supabase
      .from("clients")
      .update({
        last_message_at: new Date().toISOString(),
        sender_name: senderName || client.sender_name,
      })
      .eq("id", client.id)

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("Webhook error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
