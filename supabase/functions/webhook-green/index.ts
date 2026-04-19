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
    const messageType = body.typeWebhook
    console.log("WEBHOOK:", messageType)

    const isIncoming = messageType === "incomingMessageReceived"
    const isOutgoing = messageType === "outgoingMessageReceived" || messageType === "outgoingAPIMessageReceived"

    if (!isIncoming && !isOutgoing) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const messageData = body.messageData
    const senderData = body.senderData
    let phone = ""
    let senderName = ""

    if (isIncoming) {
      phone = senderData?.chatId || senderData?.sender || ""
      senderName = senderData?.senderName || senderData?.chatName || ""
    } else {
      phone = body.chatId || senderData?.chatId || ""
      senderName = senderData?.senderName || senderData?.chatName || ""
    }

    console.log("FROM:", phone, "NAME:", senderName, "DIR:", isIncoming ? "in" : "out")

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

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

    if (isOutgoing && messageText) {
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("client_id", client.id)
        .eq("message_text", messageText)
        .eq("direction", "out")
        .gte("created_at", new Date(Date.now() - 30000).toISOString())
        .limit(1)

      if (existing && existing.length > 0) {
        console.log("SKIP: already saved from panel")
        return new Response(JSON.stringify({ ok: true, skipped: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
    }

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

    const sender = isIncoming ? "client" : "bot"
    const direction = isIncoming ? "in" : "out"

    await supabase.from("conversations").insert({
      client_id: client.id,
      direction: direction,
      message_text: messageText,
      message_text_ru: messageTextRu,
      media_type: mediaType,
      media_url: mediaUrl,
      sender: sender,
      bot_type: isOutgoing ? "jane" : null,
      state_at_time: client.current_state,
    })

    await supabase.from("clients").update({
      last_message_at: new Date().toISOString(),
      sender_name: isIncoming ? (senderName || client.sender_name) : client.sender_name,
    }).eq("id", client.id)

    console.log("SAVED:", direction, phone)

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
