import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('../views/Dashboard.vue'),
    },
    {
      path: '/chains',
      name: 'chains',
      component: () => import('../views/ChainsList.vue'),
    },
    {
      path: '/builder',
      name: 'builder',
      component: () => import('../views/ChainBuilder.vue'),
    },
    {
      path: '/builder/:id',
      name: 'builder-edit',
      component: () => import('../views/ChainBuilder.vue'),
    },
    {
      path: '/executions',
      name: 'executions',
      component: () => import('../views/ExecutionsList.vue'),
    },
    {
      path: '/execution/:id',
      name: 'execution-detail',
      component: () => import('../views/ExecutionDetail.vue'),
    },
    {
      path: '/modules',
      name: 'modules',
      component: () => import('../views/ModulesExplorer.vue'),
    },
    {
      path: '/control',
      name: 'control',
      component: () => import('../views/ModuleControl.vue'),
    },
    {
      path: '/ai-agent',
      name: 'ai-agent',
      component: () => import('../views/AIAgent.vue'),
    },
  ],
});

export default router;
