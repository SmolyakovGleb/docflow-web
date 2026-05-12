import { z } from 'zod'
import i18n from '@/shared/lib/i18n'

const repoPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

const repoSchema = z
  .string()
  .trim()
  .min(1, i18n.t('repositories:validation.repo_required'))
  .regex(repoPattern, i18n.t('repositories:validation.repo_invalid'))

const branchSchema = z.string().trim().min(1, i18n.t('repositories:validation.branch_required'))

const excludePatternSchema = z
  .string()
  .trim()
  .min(1, i18n.t('repositories:validation.exclude_pattern_required'))

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1, i18n.t('repositories:validation.name_required')),
  source_repo: repoSchema,
  source_branch: branchSchema,
  target_repo: repoSchema,
  target_branch: branchSchema,
  exclude_patterns: z.array(excludePatternSchema),
})

export const projectUpdateSchema = z.object({
  name: z.string().trim().min(1, i18n.t('repositories:validation.name_required')).optional(),
  source_branch: branchSchema.optional(),
  target_branch: branchSchema.optional(),
  exclude_patterns: z.array(excludePatternSchema).optional(),
})

export type ProjectCreateFormValues = z.infer<typeof projectCreateSchema>
export type ProjectUpdateFormValues = z.infer<typeof projectUpdateSchema>
