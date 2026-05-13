import type { ParsedTaskLogStage, ParsedTaskLogStageId, TaskPipelineStage } from '../model/types'

const STAGE_PREFIX_PATTERNS: Array<{ id: TaskPipelineStage; pattern: RegExp }> = [
  { id: 'prepare', pattern: /^\s*(?:\[prepare\]|prepare\s*[:|-]|подготовка\s*[:|-])/i },
  { id: 'pipeline', pattern: /^\s*(?:\[pipeline\]|pipeline\s*[:|-]|перевод\s*[:|-])/i },
  { id: 'persist', pattern: /^\s*(?:\[persist\]|persist\s*[:|-]|сохранение\s*[:|-])/i },
]

function stripStagePrefix(line: string, stageId: TaskPipelineStage) {
  const matchedPattern = STAGE_PREFIX_PATTERNS.find((item) => item.id === stageId)
  if (!matchedPattern) {
    return line.trim()
  }

  return line.replace(matchedPattern.pattern, '').trim()
}

function detectStage(line: string): TaskPipelineStage | null {
  const matchedPattern = STAGE_PREFIX_PATTERNS.find((item) => item.pattern.test(line))
  return matchedPattern?.id ?? null
}

function appendLine(
  groups: Map<ParsedTaskLogStageId, string[]>,
  stageId: ParsedTaskLogStageId,
  line: string,
) {
  const bucket = groups.get(stageId)
  if (bucket) {
    bucket.push(line)
    return
  }

  groups.set(stageId, [line])
}

export function parseLogs(log: string | null, liveLines: string[] = []): ParsedTaskLogStage[] {
  const allLines = [log ?? '', ...liveLines]
    .join('\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)

  const groups = new Map<ParsedTaskLogStageId, string[]>()
  let currentStage: ParsedTaskLogStageId = 'other'

  for (const line of allLines) {
    const detectedStage = detectStage(line)

    if (detectedStage) {
      currentStage = detectedStage
      const content = stripStagePrefix(line, detectedStage)
      if (content.length > 0) {
        appendLine(groups, detectedStage, content)
      } else if (!groups.has(detectedStage)) {
        groups.set(detectedStage, [])
      }
      continue
    }

    appendLine(groups, currentStage, line.trim())
  }

  const orderedStageIds: ParsedTaskLogStageId[] = ['prepare', 'pipeline', 'persist', 'other']
  return orderedStageIds
    .filter((stageId) => groups.has(stageId))
    .map((stageId) => ({
      id: stageId,
      lines: groups.get(stageId) ?? [],
    }))
}
