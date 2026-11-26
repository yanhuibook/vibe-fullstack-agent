export async function requestPlan({ baseUrl, model, apiKey, systemPrompt, userPrompt, maxOutputTokens = 32000, thinking }) {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const endpoint = normalizedBase.endsWith('/chat/completions')
    ? normalizedBase
    : `${normalizedBase}/chat/completions`;

  const body = {
    model,
    temperature: 0.1,
    max_tokens: maxOutputTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  };
  if (thinking) body.thinking = { type: thinking };

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000)
    });
  } catch (error) {
    throw new Error(`模型请求失败：${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`模型服务返回 HTTP ${response.status}。请检查 API 地址、模型名称和凭据。`);
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('模型响应中没有可用文本。');
  return {
    content,
    usage: data.usage ?? null,
    model: data.model ?? model,
    finishReason: data?.choices?.[0]?.finish_reason ?? null
  };
}
