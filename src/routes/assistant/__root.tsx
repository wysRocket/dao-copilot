import React from 'react';
import {createRootRoute, Outlet} from '@tanstack/react-router';
import AssistantWindowLayout from '../../layouts/AssistantWindowLayout';

export const Route = createRootRoute({
  component: () => (
    <AssistantWindowLayout>
      <Outlet />
    </AssistantWindowLayout>
  ),
});
