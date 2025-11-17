import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Activity, Code2, AlertCircle, FileText, LayoutDashboard, Package, Link2 } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import Dashboard from './pages/Dashboard';
import Workflows from './pages/Workflows';
import WorkflowDetail from './pages/WorkflowDetail';
import Prompts from './pages/Prompts';
import Errors from './pages/Errors';
import Modules from './pages/Modules';
import ModulePrompts from './pages/ModulePrompts';
import ModuleHistory from './pages/ModuleHistory';
import Chains from './pages/Chains';
import ChainsList from './pages/ChainsList';
import ChainBuilder from './pages/ChainBuilder';
import ExecutionsList from './pages/ExecutionsList';
import ExecutionDetail from './pages/ExecutionDetail';
import AIAgent from './pages/AIAgent';
import BranchSwitcher from './components/BranchSwitcher';

function Navigation() {
  const location = useLocation();

  const links = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/workflows', icon: Activity, label: 'Workflows' },
    { to: '/chains', icon: Link2, label: 'AI Chains' },
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
            <Route path="/" element={<Dashboard />} />
            <Route path="/workflows" element={<Workflows />} />
            <Route path="/workflows/:id" element={<WorkflowDetail />} />
            <Route path="/chains" element={<Chains />} />
            <Route path="/chains/list" element={<ChainsList />} />
            <Route path="/chains/builder/:id?" element={<ChainBuilder />} />
            <Route path="/chains/executions/:id" element={<ExecutionDetail />} />
            <Route path="/chains/executions" element={<ExecutionsList />} />
            <Route path="/chains/ai-agent" element={<AIAgent />} />
            <Route path="/modules" element={<Modules />} />
            <Route path="/modules/:moduleName/prompts" element={<ModulePrompts />} />
            <Route path="/modules/:moduleName/commits" element={<ModuleHistory />} />
            <Route path="/prompts" element={<Prompts />} />
            <Route path="/errors" element={<Errors />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
