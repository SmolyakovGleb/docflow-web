import { baseApi } from '@/shared/api/baseApi'
import type {
  GithubRepo,
  ProjectFilesResponse,
  Project,
  ProjectCreatePayload,
  ProjectCreateResponse,
  ProjectTaskListResponse,
  ProjectUpdatePayload,
  ProjectWebhookSecretResponse,
} from '../model/types'

export const projectsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getProjects: builder.query<Project[], void>({
      query: () => ({
        url: '/projects',
      }),
      providesTags: ['Project'],
    }),
    getProject: builder.query<Project, string>({
      query: (projectId) => ({
        url: `/projects/${projectId}`,
      }),
      providesTags: (_result, _error, projectId) => [{ type: 'Project', id: projectId }],
    }),
    getProjectTasks: builder.query<ProjectTaskListResponse, string>({
      query: (projectId) => ({
        url: '/tasks',
        params: {
          project_id: projectId,
          limit: 5,
          offset: 0,
        },
      }),
    }),
    getProjectFiles: builder.query<
      ProjectFilesResponse,
      { projectId: string; path: string; useTarget?: boolean }
    >({
      query: ({ projectId, path, useTarget }) => ({
        url: `/projects/${projectId}/files`,
        params: {
          path,
          ...(useTarget ? { use_target: true } : {}),
        },
      }),
    }),
    getGithubRepos: builder.query<GithubRepo[], void>({
      query: () => ({
        url: '/me/github-repos',
      }),
    }),
    createProject: builder.mutation<ProjectCreateResponse, ProjectCreatePayload>({
      query: (data) => ({
        url: '/projects',
        method: 'POST',
        data,
      }),
      invalidatesTags: ['Project'],
    }),
    updateProject: builder.mutation<
      Project,
      {
        projectId: string
        data: ProjectUpdatePayload
      }
    >({
      query: ({ projectId, data }) => ({
        url: `/projects/${projectId}`,
        method: 'PATCH',
        data,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        'Project',
        { type: 'Project', id: projectId },
      ],
    }),
    deleteProject: builder.mutation<void, string>({
      query: (projectId) => ({
        url: `/projects/${projectId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Project'],
    }),
    regenerateSecret: builder.mutation<ProjectWebhookSecretResponse, string>({
      query: (projectId) => ({
        url: `/projects/${projectId}/regenerate-webhook-secret`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, projectId) => [
        'Project',
        { type: 'Project', id: projectId },
      ],
    }),
    pauseProject: builder.mutation<{ pipeline_paused: boolean }, string>({
      query: (projectId) => ({ url: `/projects/${projectId}/pause`, method: 'POST' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'Project', id }],
    }),
    resumeProject: builder.mutation<{ pipeline_paused: boolean }, string>({
      query: (projectId) => ({ url: `/projects/${projectId}/resume`, method: 'POST' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'Project', id }],
    }),
  }),
})

export const {
  useCreateProjectMutation,
  useDeleteProjectMutation,
  useGetGithubReposQuery,
  useGetProjectFilesQuery,
  useGetProjectQuery,
  useGetProjectTasksQuery,
  useGetProjectsQuery,
  usePauseProjectMutation,
  useRegenerateSecretMutation,
  useResumeProjectMutation,
  useUpdateProjectMutation,
} = projectsApi
