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

function toLines(value: string | string[] | null | undefined) {
  if (!value) {
    return []
  }

  const items = Array.isArray(value) ? value : [value]
  return items
    .flatMap((item) => item.split('\n'))
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
}

interface ParseLogsOptions {
  liveStage?: TaskPipelineStage | null
  fallbackStage?: TaskPipelineStage | null
}

function applyFallbackStage(
  groups: Map<ParsedTaskLogStageId, string[]>,
  fallbackStage: TaskPipelineStage | null | undefined,
) {
  if (!fallbackStage) {
    return groups
  }

  if (groups.size !== 1 || !groups.has('other')) {
    return groups
  }

  const lines = groups.get('other')
  if (!lines?.length) {
    return groups
  }

  return new Map<ParsedTaskLogStageId, string[]>([[fallbackStage, lines]])
}

export function parseLogs(
  log: string | null,
  liveLines: string[] = [],
  options: ParseLogsOptions = {},
): ParsedTaskLogStage[] {
  const groups = new Map<ParsedTaskLogStageId, string[]>()
  let currentStage: ParsedTaskLogStageId = 'other'

  for (const line of toLines(log)) {
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

  currentStage = options.liveStage ?? currentStage
  for (const line of toLines(liveLines)) {
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

  const resolvedGroups = applyFallbackStage(groups, options.fallbackStage)
  const orderedStageIds: ParsedTaskLogStageId[] = ['prepare', 'pipeline', 'persist', 'other']
  return orderedStageIds
    .filter((stageId) => resolvedGroups.has(stageId))
    .map((stageId) => ({
      id: stageId,
      lines: resolvedGroups.get(stageId) ?? [],
    }))
}
