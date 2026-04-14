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
    const { messageId, mediaUrl } = await req.json()
    const openaiKey = Deno.env.get("OPENAI_API_KEY")
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")

    // 1. Download audio file from Green API
    const audioResponse = await fetch(mediaUrl)
    if (!audioResponse.ok) throw new Error("Failed to download audio")
    const audioBlob = await audioResponse.blob()

    // 2. Send to Whisper API
    const formData = new FormData()
    formData.append("file", audioBlob, "audio.ogg")
    formData.append("model", "whisper-1")
    formData.append("language", "es")

    const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + openaiKey },
      body: formData,
    })

    if (!whisperResponse.ok) {
      const err = await whisperResponse.text()
      throw new Error("Whisper error: " + err)
    }

    const whisperData = await whisperResponse.json()
    const transcription = whisperData.text || ""

    // 3. Translate to Russian via Claude
    let transcriptionRu = ""
    if (transcription) {
      const translateResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: "Переведи с испанского на русский. Только перевод, ничего больше.",
          messages: [{ role: "user", content: transcription }],
        }),
      })
      const translateData = await translateResponse.json()
      transcriptionRu = translateData.content?.[0]?.text || ""
    }

    // 4. Save to Supabase
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    await supabase
      .from("conversations")
      .update({
        audio_transcription: transcription,
        audio_transcription_ru: transcriptionRu,
      })
      .eq("id", messageId)

    return new Response(
      JSON.stringify({ transcription, transcriptionRu }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    console.error("Transcribe error:", error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
