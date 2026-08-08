import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '@tanstack/react-router';
import { z } from 'zod';

import { AssetCreatePage } from './pages/AssetCreatePage.js';
import { AssetDetailPage } from './pages/AssetDetailPage.js';
import { AssetListPage } from './pages/AssetListPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { RootScreen } from './pages/RootScreen.js';

const wishlistListSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  categoryId: z.string().optional().catch(undefined),
  priority: z.enum(['low', 'medium', 'high']).optional().catch(undefined),
  status: z.enum(['active', 'converted', 'archived']).optional().catch(undefined),
  sort: z
    .enum(['updated_desc', 'priority_desc', 'planned_asc', 'price_asc'])
    .optional()
    .catch(undefined),
});

const reminderCreateSearchSchema = z.object({
  assetId: z.string().optional().catch(undefined),
  subscriptionId: z.string().optional().catch(undefined),
  kind: z
    .enum(['general', 'warranty_expiry', 'maintenance', 'loan_return', 'renewal'])
    .optional()
    .catch(undefined),
  title: z.string().max(160).optional().catch(undefined),
  date: z.string().optional().catch(undefined),
});

const assetListSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  categoryId: z.string().optional().catch(undefined),
  statusId: z.string().optional().catch(undefined),
  tagId: z.string().optional().catch(undefined),
  conditionGrade: z
    .enum(['new', 'like_new', 'good', 'fair', 'poor'])
    .optional()
    .catch(undefined),
  costKnowledge: z
    .enum(['known_amount', 'known_zero', 'unknown'])
    .optional()
    .catch(undefined),
  acquiredFrom: z.string().optional().catch(undefined),
  acquiredTo: z.string().optional().catch(undefined),
  minCost: z.string().optional().catch(undefined),
  maxCost: z.string().optional().catch(undefined),
  sort: z
    .enum([
      'updated_desc',
      'acquired_desc',
      'name_asc',
      'daily_cost_desc',
      'net_cost_desc',
    ])
    .optional()
    .catch(undefined),
});

export type AssetListSearch = z.infer<typeof assetListSearchSchema>;
export type WishlistListSearch = z.infer<typeof wishlistListSearchSchema>;

const rootRoute = createRootRoute({ component: RootScreen });

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
});

const assetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/assets',
  validateSearch: (search) => assetListSearchSchema.parse(search),
  component: AssetListPage,
});

const createAssetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/assets/new',
  component: AssetCreatePage,
});

const recycleBinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/assets/recycle-bin',
  component: lazyRouteComponent(
    () => import('./pages/RecycleBinPage.js'),
    'RecycleBinPage',
  ),
});

const assetDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/assets/$assetId',
  component: AssetDetailPage,
});

const ordersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/orders',
  component: lazyRouteComponent(
    () => import('./pages/OrderListPage.js'),
    'OrderListPage',
  ),
});

const createOrderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/orders/new',
  component: lazyRouteComponent(
    () => import('./pages/OrderCreatePage.js'),
    'OrderCreatePage',
  ),
});

const orderDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/orders/$orderId',
  component: lazyRouteComponent(
    () => import('./pages/OrderDetailPage.js'),
    'OrderDetailPage',
  ),
});

const wishlistRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/wishlist',
  validateSearch: (search) => wishlistListSearchSchema.parse(search),
  component: lazyRouteComponent(() => import('./pages/WishlistPage.js'), 'WishlistPage'),
});

const createWishlistRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/wishlist/new',
  component: lazyRouteComponent(
    () => import('./pages/WishlistCreatePage.js'),
    'WishlistCreatePage',
  ),
});

const wishlistDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/wishlist/$wishlistId',
  component: lazyRouteComponent(
    () => import('./pages/WishlistDetailPage.js'),
    'WishlistDetailPage',
  ),
});

const remindersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reminders',
  component: lazyRouteComponent(
    () => import('./pages/ReminderListPage.js'),
    'ReminderListPage',
  ),
});

const createReminderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reminders/new',
  validateSearch: (search) => reminderCreateSearchSchema.parse(search),
  component: lazyRouteComponent(
    () => import('./pages/ReminderCreatePage.js'),
    'ReminderCreatePage',
  ),
});

const reminderDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reminders/$reminderId',
  component: lazyRouteComponent(
    () => import('./pages/ReminderDetailPage.js'),
    'ReminderDetailPage',
  ),
});

const dataManagementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/data',
  component: lazyRouteComponent(
    () => import('./pages/DataManagementPage.js'),
    'DataManagementPage',
  ),
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: lazyRouteComponent(() => import('./pages/SettingsPage.js'), 'SettingsPage'),
});

const subscriptionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/subscriptions',
  component: lazyRouteComponent(
    () => import('./pages/SubscriptionListPage.js'),
    'SubscriptionListPage',
  ),
});

const createSubscriptionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/subscriptions/new',
  component: lazyRouteComponent(
    () => import('./pages/SubscriptionCreatePage.js'),
    'SubscriptionCreatePage',
  ),
});

const subscriptionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/subscriptions/$subscriptionId',
  component: lazyRouteComponent(
    () => import('./pages/SubscriptionDetailPage.js'),
    'SubscriptionDetailPage',
  ),
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  assetsRoute,
  createAssetRoute,
  recycleBinRoute,
  assetDetailRoute,
  ordersRoute,
  createOrderRoute,
  orderDetailRoute,
  wishlistRoute,
  createWishlistRoute,
  wishlistDetailRoute,
  subscriptionsRoute,
  createSubscriptionRoute,
  subscriptionDetailRoute,
  remindersRoute,
  createReminderRoute,
  reminderDetailRoute,
  dataManagementRoute,
  settingsRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
