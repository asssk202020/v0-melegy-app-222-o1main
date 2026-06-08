/**
 * lib/melegy-router.ts
 * الـ Router الذكي - يحلل الطلب ويوجهه للـ model المناسب
 */

import { generateWithFalRouter } from "./falRouterService"
import { MELEGY_TASK_ANALYZER_PROMPT, MELEGY_CAPABILITIES } from "./melegy-system-prompt"

interface Message {
  role: "user" | "assistant" | "system"
  content: string
}

interface TaskAnalysis {
  type: string
  confidence: number
  should_use_context: boolean
  requires_previous_result: boolean
  description: string
}

/**
 * تحليل الطلب وتحديد نوعه وأفضل model له
 */
export async function analyzeMelegeTask(
  userInput: string,
  conversationHistory: Message[]
): Promise<TaskAnalysis> {
  try {
    const analysisPrompt = `${MELEGY_TASK_ANALYZER_PROMPT}\n\nالطلب: "${userInput}"`

    const result = await generateWithFalRouter(
      "أنت محلل طلبات ذكي. ردّ بـ JSON فقط.",
      [
        ...conversationHistory.slice(-5),
        { role: "user", content: analysisPrompt }
      ],
      {
        model: "openai/gpt-oss-120b:free",
        maxTokens: 200,
        temperature: 0.3
      }
    )

    // استخراج JSON من الرد
    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }

    // Fallback: تخمين بناء على الكلمات المفتاحية
    return guessTaskType(userInput)
  } catch (error) {
    console.error("[Melegy] Error analyzing task:", error)
    return guessTaskType(userInput)
  }
}

/**
 * تخمين نوع الطلب بناء على الكلمات المفتاحية
 */
function guessTaskType(input: string): TaskAnalysis {
  const lower = input.toLowerCase()

  if (
    lower.includes("صورة") || 
    lower.includes("رسمة") || 
    lower.includes("صوّر") ||
    lower.includes("draw") ||
    lower.includes("image")
  ) {
    if (
      lower.includes("عدّل") ||
      lower.includes("غيّر") ||
      lower.includes("edit") ||
      lower.includes("modify")
    ) {
      return {
        type: "image_edit",
        confidence: 0.8,
        should_use_context: true,
        requires_previous_result: true,
        description: "تعديل صورة"
      }
    }
    return {
      type: "image_generation",
      confidence: 0.85,
      should_use_context: false,
      requires_previous_result: false,
      description: "توليد صورة جديدة"
    }
  }

  if (
    lower.includes("كود") ||
    lower.includes("برنامج") ||
    lower.includes("code") ||
    lower.includes("script") ||
    lower.includes("python") ||
    lower.includes("javascript")
  ) {
    return {
      type: "code",
      confidence: 0.9,
      should_use_context: true,
      requires_previous_result: false,
      description: "طلب كود أو برمجة"
    }
  }

  if (
    lower.includes("ملف") ||
    lower.includes("excel") ||
    lower.includes("جدول") ||
    lower.includes("عرض") ||
    lower.includes("file") ||
    lower.includes("spreadsheet")
  ) {
    return {
      type: "file_generation",
      confidence: 0.85,
      should_use_context: true,
      requires_previous_result: false,
      description: "إنشاء ملف"
    }
  }

  if (
    lower.includes("seo") ||
    lower.includes("محرك") ||
    lower.includes("البحث") ||
    lower.includes("optimization")
  ) {
    return {
      type: "seo",
      confidence: 0.8,
      should_use_context: true,
      requires_previous_result: false,
      description: "تحسين SEO"
    }
  }

  // Default: محادثة عامة
  return {
    type: "general",
    confidence: 0.5,
    should_use_context: true,
    requires_previous_result: false,
    description: "محادثة عامة"
  }
}

/**
 * التوجيه الموحد - يرسل الطلب للـ model المناسب مع الـ full context
 */
export async function routeMelegeRequest(
  userInput: string,
  conversationHistory: Message[],
  systemPrompt: string
): Promise<string> {
  // تحليل الطلب
  const taskAnalysis = await analyzeMelegeTask(userInput, conversationHistory)
  console.log("[Melegy Router] Task type:", taskAnalysis.type)

  // الحصول على الـ model المناسب
  const taskCapability = MELEGY_CAPABILITIES[taskAnalysis.type as keyof typeof MELEGY_CAPABILITIES] ||
    MELEGY_CAPABILITIES.general

  // إرسال الطلب للـ model الصحيح مع كل الـ context
  const messages: Message[] = [
    ...conversationHistory.slice(-10), // آخر 10 رسائل للـ context
    { role: "user", content: userInput }
  ]

  const response = await generateWithFalRouter(
    systemPrompt,
    messages,
    {
      model: taskCapability.model as string,
      maxTokens: taskAnalysis.type === "code" ? 2000 : 1500,
      temperature: taskAnalysis.type === "code" ? 0.2 : 0.7
    }
  )

  return response
}
