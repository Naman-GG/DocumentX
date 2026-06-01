import { Router } from 'express'
import Groq from 'groq-sdk'

/**
 * AI proxy routes, backed by Groq (OpenAI-compatible, free tier, fast). The API
 * key stays server-side; the client only ever talks to this router. Streaming
 * tasks (`generate`, `autocomplete`) pipe Server-Sent Events back to the
 * browser; the rest return a single JSON result.
 */

export const aiRouter = Router()

// Reads GROQ_API_KEY from the environment.
const client = new Groq()

// Fast, capable model on Groq's free tier — a good fit for these writing tasks.
const MODEL = 'llama-3.3-70b-versatile'

type Task = 'generate' | 'summarize' | 'grammar' | 'minutes' | 'autocomplete'

interface AIRequestBody {
  task: Task
  content?: string
  prompt?: string
}

const SYSTEM_PROMPTS: Record<Task, string> = {
  generate:
    'You are a writing assistant embedded in a collaborative document editor. ' +
    'Write clear, well-structured prose based on the user request. Return only the ' +
    'requested text with no preamble, meta-commentary, or surrounding quotation marks.',
  autocomplete:
    'You are an inline autocomplete engine inside a document editor. Continue the ' +
    "user's text naturally from where it stops. Return only the continuation — a short " +
    'phrase or at most one sentence. Do not repeat the existing text, and do not add ' +
    'quotation marks or commentary.',
  summarize:
    'You are a summarization assistant. Read the document the user provides and return ' +
    'a concise summary as 3–5 bullet points. Each bullet starts with "- ". Return only ' +
    'the bullet list, no heading or preamble.',
  grammar:
    'You are a meticulous copy editor. Correct grammar, spelling, and punctuation in the ' +
    "text the user provides. Preserve the author's meaning, voice, and formatting. Return " +
    'ONLY the corrected text with no explanations, notes, or quotation marks.',
  minutes:
    'You convert raw voice-chat transcripts into professional meeting minutes. Produce a ' +
    'well-structured document using Markdown headings (##) for these sections in order: ' +
    'Attendees, Key Discussion Points, Decisions Made, Action Items, and Next Steps. Use ' +
    'bullet lists within sections. If a section has no content, write "- None noted." ' +
    'Return only the document.',
}

function buildUserMessage(body: AIRequestBody): string {
  const { task, content = '', prompt = '' } = body
  switch (task) {
    case 'generate':
      return prompt || 'Write a short paragraph.'
    case 'autocomplete':
      return `Continue this text:\n\n${content}`
    case 'summarize':
      return `Summarize the following document:\n\n${content}`
    case 'grammar':
      return `Correct the following text:\n\n${content}`
    case 'minutes':
      return (
        'Convert the following voice chat transcript into meeting minutes:\n\n' + content
      )
  }
}

aiRouter.post('/', async (req, res) => {
  const body = req.body as AIRequestBody
  const { task } = body

  if (!task || !SYSTEM_PROMPTS[task]) {
    res.status(400).json({ error: 'Invalid or missing "task".' })
    return
  }

  const isStreaming = task === 'generate' || task === 'autocomplete'
  // Autocomplete is short and latency-critical; generate can run longer.
  const maxTokens = task === 'autocomplete' ? 64 : task === 'minutes' ? 2048 : 1024

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPTS[task] },
    { role: 'user', content: buildUserMessage(body) },
  ]

  try {
    if (isStreaming) {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.flushHeaders?.()

      // Abort the upstream request only if the client disconnects before we've
      // finished writing. (`req`'s 'close' fires as soon as the body is consumed,
      // so we watch the response connection instead.)
      const controller = new AbortController()
      res.on('close', () => {
        if (!res.writableEnded) controller.abort()
      })

      const stream = await client.chat.completions.create(
        { model: MODEL, max_tokens: maxTokens, messages, stream: true },
        { signal: controller.signal }
      )

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content
        if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`)
      }
      res.write('data: [DONE]\n\n')
      res.end()
    } else {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_tokens: maxTokens,
        messages,
      })
      const result = completion.choices[0]?.message?.content ?? ''
      res.json({ result })
    }
  } catch (err) {
    if (controllerAborted(err)) return // client went away; nothing to send
    console.error('[ai] request failed', err)
    if (!res.headersSent) {
      const status = err instanceof Groq.APIError ? err.status ?? 500 : 500
      res.status(status).json({ error: 'AI request failed.' })
    } else {
      res.write(`data: ${JSON.stringify({ error: 'AI request failed.' })}\n\n`)
      res.end()
    }
  }
})

function controllerAborted(err: unknown): boolean {
  return (
    err instanceof Groq.APIUserAbortError ||
    (err instanceof Error && err.name === 'AbortError')
  )
}
