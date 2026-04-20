import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { text, from, to } = await req.json()
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY")

    let systemPrompt = ""
    if (from === "ru" && to === "es") {
      systemPrompt = "Переведи с русского на испанский (Испания). Стиль: профессиональный но дружелюбный, tuteo. Только перевод, ничего больше."
    } else if (from === "es" && to === "ru") {
      systemPrompt = "Ты переводчик. Переведи следующий текст с испанского языка на русский язык. Выдай ТОЛЬКО перевод на русском, без оригинала, без пояснений."
    } else {
      systemPrompt = "Переведи текст на русский язык. Только перевод, ничего больше."
    }

    console.log("TRANSLATE:", from, "->", to, "text:", text.substring(0, 50))

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: "Переведи на русский:\n\n" + text }],
      }),
    })

    const data = await response.json()
    const translated = data.content?.[0]?.text || ""

    console.log("RESULT:", translated.substring(0, 50))

    return new Response(
      JSON.stringify({ translated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
