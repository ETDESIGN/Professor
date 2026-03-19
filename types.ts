// Shared types for the application

export enum LoadingState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface GenericResponse<T> {
  data?: T;
  error?: string;
  status: LoadingState;
}