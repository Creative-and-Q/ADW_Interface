import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Code2, AlertCircle, LayoutDashboard, Package } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { useEffect, useState } from 'react';
import Dashboard from './pages/Dashboard';
import Prompts from './pages/Prompts';
import Errors from './pages/Errors';
import Modules from './pages/Modules';
import ModulePrompts from './pages/ModulePrompts';
import ModuleHistory from './pages/ModuleHistory';
import ModuleSettings from './pages/ModuleSettings';
import BranchSwitcher from './components/BranchSwitcher';
import ModulePage from './components/ModulePage';
import { modulePluginsAPI, type ModulePage as ModulePageType } from './services/api';
import * as Icons from 'lucide-react';

function Navigation() {
  const location = useLocation();
  const [modulePages, setModulePages] = useState<ModulePageType[]>([]);

  useEffect(() => {
    // Load module pages for navigation
    modulePluginsAPI.getPages()
      .then((response) => {
        if (response.data.success) {
          // Filter to only top-level pages (not nested routes) and sort by navOrder
          const topLevelPages = response.data.data
            .filter((mp: ModulePageType) => {
              const pathParts = mp.page.path.split('/').filter(Boolean);
              return pathParts.length === 1; // Only top-level paths
            })
            .sort((a: ModulePageType, b: ModulePageType) => {
              const orderA = a.page.navOrder ?? 999;
              const orderB = b.page.navOrder ?? 999;
              return orderA - orderB;
            });
          setModulePages(topLevelPages);
        }
      })
      .catch((error) => {
        console.error('Failed to load module pages:', error);
      });
  }, []);

  // Get icon component from string name
  const getIcon = (iconName?: string) => {
    if (!iconName) return Package;
    const IconComponent = (Icons as any)[iconName];
    return IconComponent || Package;
  };

  const links = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    ...modulePages.map((mp) => ({
      to: mp.page.path,
      icon: getIcon(mp.page.icon),
      label: mp.page.label,
    })),
    { to: '/modules', icon: Package, label: 'Modules' },
    { to: '/prompts', icon: Code2, label: 'Prompts' },
    { to: '/errors', icon: AlertCircle, label: 'Errors' },
  ];

  return (
    <nav className="bg-gradient-to-r from-primary-600 to-primary-700 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <FileText className="h-8 w-8 text-white mr-3" />
              <h1 className="text-2xl font-bold text-white tracking-tight">
                AIDeveloper
              </h1>
            </div>
            <div className="hidden sm:ml-8 sm:flex sm:space-x-4">
              {links.map((link) => {
                const Icon = link.icon;
                const isActive = location.pathname === link.to;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      isActive
                        ? 'bg-primary-800 text-white'
                        : 'text-primary-100 hover:bg-primary-500 hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <BranchSwitcher />
            <div className="flex items-center space-x-2 text-primary-100 text-sm">
              <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse"></div>
              <span>Live</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

function App() {
  const [moduleRoutes, setModuleRoutes] = useState<ModulePageType[]>([]);

  useEffect(() => {
    // Load all module pages for routing
    modulePluginsAPI.getPages()
      .then((response) => {
        if (response.data.success) {
          setModuleRoutes(response.data.data);
        }
      })
      .catch((error) => {
        console.error('Failed to load module routes:', error);
      });
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: '#10b981',
                secondary: '#fff',
              },
            },
            error: {
              duration: 5000,
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
        <Navigation />
        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Routes>
            {/* Core AIDeveloper routes */}
            <Route path="/" element={<Dashboard />} />
            <Route path="/modules" element={<Modules />} />
            <Route path="/modules/settings" element={<ModuleSettings />} />
            <Route path="/modules/:moduleName/prompts" element={<ModulePrompts />} />
            <Route path="/modules/:moduleName/commits" element={<ModuleHistory />} />
            <Route path="/prompts" element={<Prompts />} />
            <Route path="/errors" element={<Errors />} />

            {/* Dynamic module routes */}
            {moduleRoutes.map((mp) => (
              <Route
                key={`${mp.module}-${mp.page.path}`}
                path={mp.page.path}
                element={
                  <ModulePage
                    module={mp.module}
                    componentName={mp.page.component}
                    componentPath={mp.page.component}
                  />
                }
              />
            ))}
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
