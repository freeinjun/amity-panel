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
    const { messages, clientName, question } = await req.json()
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY")

    const context = messages.map((m: any) => {
      const role = m.role === "client" ? "Cliente" : "Tú (Denis/Jane)"
      return `${role}: ${m.text}`
    }).join("\n")

    const systemPrompt = `Ты — внутренний AI-помощник Дениса, основателя Amity AI. Денис ведёт бизнес по запуску рекламы для салонов красоты в Испании.

Тебе дан контекст переписки с клиентом ${clientName}. Денис задаёт тебе вопрос о клиенте или просит что-то проанализировать.

Отвечай на русском. Это внутренний инструмент — клиент ничего не увидит.

Контекст переписки:
${context}

Отвечай кратко и по делу.`

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: question }],
      }),
    })

    const data = await response.json()
    const answer = data.content?.[0]?.text || ""

    return new Response(
      JSON.stringify({ answer }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
