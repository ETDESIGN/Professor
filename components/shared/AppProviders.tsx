import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../services/queryClient';

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <QueryClientProvider client={queryClient}>
    {children}
  </QueryClientProvider>
);
