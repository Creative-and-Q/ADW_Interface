/**
 * ModuleSettings Page
 * Manage environment variables for all modules
 */

import { useEffect, useState } from 'react';
import { modulePluginsAPI } from '../services/api';
import { Eye, EyeOff, Save, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface EnvVarValue {
  key: string;
  value: string | null;
  module: string;
  definition: {
    description: string;
    required: boolean;
    defaultValue?: string;
    type?: 'string' | 'number' | 'boolean';
    secret?: boolean;
    modulePrefix?: string;
  };
}

export default function ModuleSettings() {
  const [envVars, setEnvVars] = useState<EnvVarValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [validationIssues, setValidationIssues] = useState<Array<{
    module: string;
    key: string;
    missing: boolean;
  }>>([]);

  useEffect(() => {
    loadEnvVars();
    validateEnvVars();
  }, []);

  const loadEnvVars = async () => {
    try {
      const response = await modulePluginsAPI.getEnvVars();
      if (response.data.success) {
        setEnvVars(response.data.data);
      }
    } catch (error) {
      console.error('Failed to load env vars:', error);
      toast.error('Failed to load environment variables');
    } finally {
      setLoading(false);
    }
  };

  const validateEnvVars = async () => {
    try {
      const response = await fetch('/api/modules/env/validate');
      const data = await response.json();
      if (data.success) {
        setValidationIssues(data.data);
      }
    } catch (error) {
      console.error('Failed to validate env vars:', error);
    }
  };

  const handleSave = async () => {
    if (Object.keys(changes).length === 0) {
      toast.error('No changes to save');
      return;
    }

    setSaving(true);
    try {
      await modulePluginsAPI.updateEnvVars(changes);
      toast.success('Environment variables updated successfully');
      setChanges({});
      await loadEnvVars();
      await validateEnvVars();
    } catch (error: any) {
      console.error('Failed to save env vars:', error);
      toast.error(error.response?.data?.message || 'Failed to save environment variables');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: string, value: string) => {
    setChanges((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSecretVisibility = (key: string) => {
    setVisibleSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const getValue = (envVar: EnvVarValue): string => {
    if (envVar.key in changes) {
      return changes[envVar.key];
    }
    return envVar.value || envVar.definition.defaultValue || '';
  };

  const hasChanges = Object.keys(changes).length > 0;
  const hasValidationIssues = validationIssues.length > 0;

  // Group env vars by module
  const envVarsByModule = envVars.reduce((acc, envVar) => {
    if (!acc[envVar.module]) {
      acc[envVar.module] = [];
    }
    acc[envVar.module].push(envVar);
    return acc;
  }, {} as Record<string, EnvVarValue[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 sm:px-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Module Settings</h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage environment variables for all modules
          </p>
        </div>
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center space-x-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white rounded-md transition-colors"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        )}
      </div>

      {/* Validation Issues Alert */}
      {hasValidationIssues && (
        <div className="card bg-yellow-50 border-yellow-200">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-900 mb-1">
                Missing Required Environment Variables
              </h3>
              <ul className="text-sm text-yellow-800 list-disc list-inside">
                {validationIssues.map((issue) => (
                  <li key={`${issue.module}-${issue.key}`}>
                    <code>{issue.key}</code> in module <code>{issue.module}</code>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Module Environment Variables */}
      {Object.entries(envVarsByModule).map(([module, vars]) => (
        <div key={module} className="card">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">{module}</h3>
          <div className="space-y-4">
            {vars.map((envVar) => {
              const value = getValue(envVar);
              const isSecret = envVar.definition.secret;
              const isVisible = !isSecret || visibleSecrets.has(envVar.key);
              const isRequired = envVar.definition.required;
              const hasIssue = validationIssues.some(
                (issue) => issue.module === module && issue.key === envVar.key
              );

              return (
                <div key={envVar.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor={envVar.key}
                      className="block text-sm font-medium text-gray-700"
                    >
                      {envVar.key}
                      {isRequired && (
                        <span className="text-red-500 ml-1" title="Required">
                          *
                        </span>
                      )}
                      {hasIssue && (
                        <AlertCircle className="h-4 w-4 text-red-500 inline-block ml-1" />
                      )}
                    </label>
                    {isSecret && (
                      <button
                        type="button"
                        onClick={() => toggleSecretVisibility(envVar.key)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        {isVisible ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                  <input
                    id={envVar.key}
                    type={isSecret && !isVisible ? 'password' : 'text'}
                    value={value}
                    onChange={(e) => handleChange(envVar.key, e.target.value)}
                    className={`w-full px-3 py-2 border rounded-md ${
                      hasIssue
                        ? 'border-red-300 bg-red-50'
                        : 'border-gray-300 focus:border-primary-500 focus:ring-primary-500'
                    }`}
                    placeholder={envVar.definition.defaultValue || 'Enter value...'}
                  />
                  {envVar.definition.description && (
                    <p className="text-xs text-gray-500">{envVar.definition.description}</p>
                  )}
                  {envVar.definition.defaultValue && (
                    <p className="text-xs text-gray-400">
                      Default: <code>{envVar.definition.defaultValue}</code>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {envVars.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-gray-500">No environment variables found in module manifests.</p>
        </div>
      )}
    </div>
  );
}


