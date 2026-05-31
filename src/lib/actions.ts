import type {
  MeshPromptActionBuildResult,
  MeshPromptActionDefinition,
  MeshPromptActionExecutionContext,
  MeshPromptCustomActionDefinition,
  MeshPromptGenerateOptions,
  MeshPromptMessage,
} from "./types";

const defaultOptions = {
  temperature: 0.35,
  maxOutputTokens: 1800,
} satisfies MeshPromptGenerateOptions;

export const builtInPromptActions = [
  createTextAction({
    id: "enhance-prompt",
    label: "Enhance Prompt",
    description: "Turn rough text into a clear, structured AI prompt.",
    category: "write",
    systemPrompt: (context) => {
      const basePrompt = `You are MeshPrompt, an adaptive prompt optimization engine.

Your job is to rewrite the user’s raw prompt into a better prompt for an AI coding, writing, or productivity assistant.

Do NOT always make the prompt short.
Do NOT always make the prompt long.
Match the output depth to the task complexity.

First classify the raw prompt by intent:
- Simple Task
- Medium Feature/Bug Task
- Complex Product/Architecture Task

Classification must be based on user intent, not prompt length.

Rules:
- Preserve all important requirements.
- Preserve user intent and expected behavior.
- Remove filler words, repetition, and unclear phrasing.
- Do not remove implementation details just to make the prompt shorter.
- Add reasonable missing details only when the user’s intent is clear.
- Keep the prompt practical and directly usable.
- Do not over-engineer simple requests.
- Output only the optimized prompt.

For Simple Tasks:
Return a concise optimized prompt in 3–8 lines.

For Medium Feature/Bug Tasks:
Use:
Goal
Required Behavior
Implementation Notes
Acceptance Criteria

For Complex Product/Architecture Tasks:
Use:
Goal
Context
Required Behavior
Technical Requirements
Edge Cases
Privacy/Security Notes
Acceptance Criteria
QA Checklist`;
      
      const mode = context.settings?.enhancePromptMode || "auto";
      let prompt = basePrompt;
      if (mode === "concise") {
        prompt += "\n\nCRITICAL OVERRIDE: The user has requested CONCISE mode. Force a shorter concise output style regardless of task complexity.";
      } else if (mode === "structured") {
        prompt += "\n\nCRITICAL OVERRIDE: The user has requested STRUCTURED mode. Force a medium structured output style regardless of task complexity.";
      } else if (mode === "detailed") {
        prompt += "\n\nCRITICAL OVERRIDE: The user has requested DETAILED mode. Force a detailed implementation output style regardless of task complexity.";
      }
      
      prompt += `\n\nCRITICAL DIRECTIVE ON OUTPUT FORMAT:
You must output ONLY the final optimized/enhanced prompt itself.
Do NOT include any introductory lines like "Optimized Prompt:", "Here is the optimized prompt:", or similar.
Do NOT include any conversational filler, meta-commentary, explanations of changes, warnings, or notes at the beginning or at the end (such as "Note: I've rephrased...").
Start directly with the actual text of the optimized prompt, and stop immediately when the prompt is complete.
Absolutely no extra headers, commentary, explanation, or conversational framing is allowed. The output must be directly usable as a prompt.`;

      return prompt;
    },
    instruction: "Raw input:",
    options: { temperature: 0.3, maxOutputTokens: 2600 },
  }),
  createTextAction({
    id: "make-concise",
    label: "Make Concise",
    description: "Shorten text while preserving meaning.",
    category: "edit",
    systemPrompt:
      "You are MeshPrompt. Make text shorter without losing important meaning, names, numbers, constraints, or tone.",
    instruction: "Condense the selected text. Remove repetition and filler. Keep the output direct and complete.",
    options: { temperature: 0.2, maxOutputTokens: 1000 },
  }),
  createTextAction({
    id: "expand-details",
    label: "Expand Details",
    description: "Add clarity, context, and completeness.",
    category: "write",
    systemPrompt:
      "You are MeshPrompt. Expand concise notes into clear instructions without adding unsupported facts. Mark assumptions explicitly when needed.",
    instruction: "Expand the selected text with useful structure, missing context, edge cases, and clear next steps.",
    options: { temperature: 0.45, maxOutputTokens: 2600 },
  }),
  createTextAction({
    id: "rewrite-professionally",
    label: "Rewrite Professionally",
    description: "Make text polished and business-ready.",
    category: "edit",
    systemPrompt:
      "You are MeshPrompt. Rewrite text in a professional, calm, precise voice. Preserve the sender's intent and factual content.",
    instruction: "Rewrite the selected text professionally. Keep it concise, respectful, and ready to send.",
  }),
  createTextAction({
    id: "developer-prompt",
    label: "Developer Prompt",
    description: "Convert text into a technical prompt for coding agents.",
    category: "transform",
    systemPrompt:
      "You are MeshPrompt. Convert rough engineering requests into precise coding-agent prompts with scope, files, constraints, implementation order, tests, and acceptance criteria.",
    instruction:
      "Turn the selected text into a coding-agent prompt. Include what to inspect first, what to change, what not to break, and how to verify.",
    options: { temperature: 0.25, maxOutputTokens: 2800 },
  }),
  createTextAction({
    id: "product-prompt",
    label: "Product Prompt",
    description: "Convert text into a product or feature-building prompt.",
    category: "transform",
    systemPrompt:
      "You are MeshPrompt. Convert feature ideas into product-ready implementation prompts with user value, UX requirements, states, edge cases, and acceptance criteria.",
    instruction:
      "Turn the selected text into a product feature prompt suitable for a designer or product-focused engineering agent.",
    options: { temperature: 0.35, maxOutputTokens: 2600 },
  }),
  createTextAction({
    id: "bug-report",
    label: "Bug Report",
    description: "Turn rough notes into a clear bug report.",
    category: "analyze",
    systemPrompt:
      "You are MeshPrompt. Convert rough bug notes into actionable bug reports. Separate observed behavior from guesses and include reproduction steps when implied.",
    instruction:
      "Create a concise bug report with title, environment, observed behavior, expected behavior, reproduction steps, suspected cause, and acceptance criteria.",
    options: { temperature: 0.2, maxOutputTokens: 2200 },
  }),
  createTextAction({
    id: "email-rewrite",
    label: "Email Rewrite",
    description: "Turn rough text into a professional email.",
    category: "write",
    systemPrompt:
      "You are MeshPrompt. Rewrite text as a professional email. Keep the user's intent, make the ask clear, and avoid excessive formality.",
    instruction: "Convert the selected text into a clean email with subject and body.",
    options: { temperature: 0.35, maxOutputTokens: 1800 },
  }),
  createTextAction({
    id: "summarize",
    label: "Summarize",
    description: "Create a short summary.",
    category: "analyze",
    systemPrompt: "You are MeshPrompt. Summarize accurately without adding unsupported claims.",
    instruction: "Summarize the selected text into high-signal bullets and include the key decision or ask if present.",
    options: { temperature: 0.15, maxOutputTokens: 1000 },
  }),
  createTextAction({
    id: "custom-instruction",
    label: "Custom Instruction",
    description: "Apply a reusable custom transformation instruction.",
    category: "custom",
    systemPrompt:
      "You are MeshPrompt. Apply the user's custom transformation instruction exactly. Preserve factual content unless the instruction explicitly asks otherwise.",
    instruction:
      "Apply the user instruction to the selected text. If no instruction is supplied, improve clarity and structure while preserving meaning.",
    options: { temperature: 0.4, maxOutputTokens: 2200 },
  }),
] as const satisfies readonly MeshPromptActionDefinition[];

export type BuiltInPromptActionId = (typeof builtInPromptActions)[number]["id"];

export function getBuiltInPromptAction(actionId: BuiltInPromptActionId | string): MeshPromptActionDefinition {
  const action = builtInPromptActions.find((entry) => entry.id === actionId);
  if (!action) {
    throw new Error(`Unsupported MeshPrompt action: ${actionId}`);
  }
  return action;
}

export function createCustomPromptAction(definition: MeshPromptCustomActionDefinition): MeshPromptActionDefinition {
  assertActionId(definition.id);

  return {
    id: definition.id,
    label: definition.label,
    description: definition.description ?? "Custom MeshPrompt action.",
    category: definition.category ?? "custom",
    inputs: definition.inputs ?? [],
    build(context) {
      const messages: MeshPromptMessage[] = [];
      if (definition.systemPrompt) {
        messages.push({ role: "system", content: renderTemplate(definition.systemPrompt, context) });
      }
      messages.push({ role: "user", content: renderTemplate(definition.userPromptTemplate, context) });
      return { messages, options: definition.options };
    },
  };
}

export function buildPromptActionRequest(
  action: MeshPromptActionDefinition,
  context: MeshPromptActionExecutionContext,
): MeshPromptActionBuildResult {
  return action.build(context);
}

function createTextAction(definition: {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly category: MeshPromptActionDefinition["category"];
  readonly systemPrompt: string | ((context: MeshPromptActionExecutionContext) => string);
  readonly instruction: string;
  readonly options?: MeshPromptGenerateOptions;
}): MeshPromptActionDefinition {
  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    category: definition.category,
    inputs: [
      {
        key: "userInstruction",
        label: "Instruction",
        description: "Optional tone, audience, format, or constraints.",
        required: false,
        multiline: true,
      },
    ],
    build(context) {
      const selectedText = context.selectedText?.trim();
      const documentText = context.documentText?.trim();
      const userInstruction = context.userInstruction?.trim();
      const sourceText = selectedText && selectedText.length > 0 ? selectedText : documentText;

      return {
        messages: [
          { role: "system", content: typeof definition.systemPrompt === "function" ? definition.systemPrompt(context) : definition.systemPrompt },
          {
            role: "user",
            content: [
              definition.instruction,
              userInstruction ? `User instruction:\n${userInstruction}` : undefined,
              sourceText ? `Source text:\n${sourceText}` : "No source text was provided. Use the user instruction only.",
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
        options: { ...defaultOptions, ...definition.options },
      };
    },
  };
}

function renderTemplate(template: string, context: MeshPromptActionExecutionContext): string {
  const variables: Record<string, string> = {
    selectedText: context.selectedText ?? "",
    documentText: context.documentText ?? "",
    userInstruction: context.userInstruction ?? "",
    ...(context.variables ?? {}),
  };

  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key: string) => variables[key] ?? match);
}

function assertActionId(actionId: string): void {
  if (!/^[a-z0-9][a-z0-9-_.]*$/i.test(actionId)) {
    throw new Error(`Invalid MeshPrompt action id: ${actionId}`);
  }
}
