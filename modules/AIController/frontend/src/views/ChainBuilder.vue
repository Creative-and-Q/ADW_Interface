<template>
  <div>
    <div class="flex items-center justify-between mb-8">
      <h1 class="text-3xl font-bold">Chain Builder</h1>
      <div class="flex space-x-3">
        <button @click="testChain" class="btn btn-secondary" :disabled="!canTest">
          Test Chain
        </button>
        <button @click="saveChain" class="btn btn-primary" :disabled="!canSave">
          {{ editMode ? 'Update' : 'Save' }} Chain
        </button>
      </div>
    </div>

    <!-- Chain Details -->
    <div class="card mb-6">
      <h2 class="text-xl font-bold mb-4">Chain Details</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Chain Name</label>
          <input
            v-model="chainName"
            type="text"
            class="input"
            placeholder="My Awesome Chain"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            Chain Owner
            <span class="text-xs text-gray-500 ml-1">(who can edit this chain)</span>
          </label>
          <input
            v-model="chainOwner"
            type="text"
            class="input"
            placeholder="admin"
          />
        </div>
        <div class="md:col-span-2">
          <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            v-model="description"
            class="input"
            rows="2"
            placeholder="Describe what this chain does..."
          ></textarea>
        </div>
      </div>
    </div>

    <!-- Input Fields (Auto-detected) -->
    <div v-if="detectedInputFields.length > 0" class="card mb-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold">Input Fields</h2>
        <span class="badge bg-blue-100 text-blue-800 text-xs">
          Auto-detected from steps
        </span>
      </div>
      <div class="text-sm text-gray-600 mb-4">
        These fields will be used when testing and executing this chain. Values detected from <code class="bg-gray-100 px-1 rounded" v-text="'{{input.*}}'"></code> variables in your steps.
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="field in detectedInputFields" :key="field" class="relative">
          <label class="block text-sm font-medium text-gray-700 mb-1">
            {{ formatFieldName(field) }}
            <span v-if="field === 'userId'" class="text-red-600">*</span>
          </label>
          <input
            v-model="inputValues[field]"
            type="text"
            class="input"
            :placeholder="`Enter ${formatFieldName(field).toLowerCase()}`"
          />
          <div class="absolute top-0 right-0 text-xs text-gray-400 mt-1">
            <code>{{ getInputVariableName(field) }}</code>
          </div>
        </div>
      </div>
    </div>

    <!-- Split Screen Layout: Steps (left) and Configuration (right) -->
    <div class="flex flex-col lg:flex-row gap-6 mb-6">
      <!-- Left Panel: Steps -->
      <div class="w-full lg:w-1/2">
        <div class="card sticky top-0" style="max-height: calc(100vh - 200px); overflow-y: auto;">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold">Steps ({{ steps.length }})</h2>
            <div class="flex items-center space-x-2">
              <button @click="showRoutingFlow = !showRoutingFlow" class="btn btn-secondary btn-sm" v-if="hasAnyRoutingRules">
                {{ showRoutingFlow ? '🔀 Hide Flow' : '🔀 Show Flow' }}
              </button>
              <button @click="addStepToRoot" class="btn btn-primary btn-sm">
                + Add Step
              </button>
            </div>
          </div>

          <div v-if="steps.length === 0" class="text-center py-12 bg-gray-50 rounded-lg">
            <p class="text-gray-500 mb-4">No steps yet. Add your first step to get started!</p>
            <button @click="addStepToRoot" class="btn btn-primary">
              + Add First Step
            </button>
          </div>

          <div v-else class="space-y-3">
            <!-- Render steps -->
            <template v-for="(step, index) in steps" :key="step.id">
              <!-- Step card -->
              <div
                class="step-card"
                :class="{ selected: isStepSelected([index]) }"
                @click="selectStepByPath([index])"
              >
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <div class="flex items-center space-x-2 mb-2">
                      <span class="text-lg font-bold text-gray-700">Step {{ index + 1 }}</span>
                      <span
                        v-if="step.type === 'chain_call'"
                        class="badge bg-purple-100 text-purple-800"
                      >
                        Chain Call
                      </span>
                      <span
                        v-else
                        :class="`badge badge-${(step as any).module}`"
                      >
                        {{ (step as any).module }}
                      </span>
                      <span v-if="(step as any).method" class="text-sm text-gray-500">{{ (step as any).method }}</span>
                    </div>
                    <div class="text-sm text-gray-600 mb-2">
                      <strong>{{ step.name || step.id }}</strong>
                    </div>
                    <div v-if="(step as any).endpoint" class="text-xs text-gray-500">{{ (step as any).endpoint }}</div>
                    <div v-else-if="step.type === 'chain_call'" class="text-xs text-gray-500">Invokes chain #{{ (step as any).chain_id }}</div>
                    <!-- Routing indicator -->
                    <div v-if="(step as any).conditionalRouting && (step as any).conditionalRouting.length > 0" class="mt-2">
                      <span class="badge bg-orange-100 text-orange-800 text-xs">
                        ⚡ {{ (step as any).conditionalRouting.length }} routing rule{{ (step as any).conditionalRouting.length > 1 ? 's' : '' }}
                      </span>
                      <!-- Flow visualization -->
                      <div v-if="showRoutingFlow" class="mt-2 space-y-1">
                        <div v-for="(rule, ruleIdx) in (step as any).conditionalRouting" :key="ruleIdx" class="text-xs flex items-center space-x-2 pl-2 border-l-2 border-orange-300">
                          <span class="text-orange-600">→</span>
                          <span class="font-mono text-gray-600">
                            {{ rule.action === 'skip_to_step' ? 'Skip to ' + getStepName(rule.target) : rule.action === 'jump_to_chain' ? 'Jump to Chain #' + rule.target : 'Stop Chain' }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="flex items-center space-x-2">
                    <button
                      @click.stop="moveStepUp(index)"
                      :disabled="index === 0"
                      class="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      @click.stop="moveStepDown(index)"
                      :disabled="index === steps.length - 1"
                      class="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      @click.stop="deleteStep(index)"
                      class="text-red-500 hover:text-red-700"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- Right Panel: Step Configuration and Output Builder -->
      <div class="w-full lg:w-1/2 space-y-6" style="max-height: calc(100vh - 200px); overflow-y: auto;">
        <!-- Step Configuration -->
        <div v-if="selectedStep" class="card">
      <h2 class="text-xl font-bold mb-4">
        Configure: {{ selectedStep.name || selectedStep.id }}
        <span v-if="selectedStep.type === 'chain_call'" class="badge bg-purple-100 text-purple-800 ml-2">Chain Call</span>
        <span v-else :class="`badge badge-${(selectedStep as any).module} ml-2`">{{ (selectedStep as any).module }}</span>
      </h2>

      <div class="space-y-4">
        <!-- Basic Info -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Step ID</label>
            <input v-model="selectedStep.id" type="text" class="input" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Step Name</label>
            <input v-model="selectedStep.name" type="text" class="input" placeholder="Optional" />
          </div>
        </div>

        <!-- Step Type Selector -->
        <div class="border-b border-gray-200 pb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">Step Type</label>
          <div class="flex space-x-3">
            <button
              @click="setStepType('module_call')"
              class="flex-1 py-3 px-4 rounded-lg border-2 transition-all"
              :class="(!selectedStep.type || selectedStep.type === 'module_call')
                ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                : 'border-gray-200 hover:border-gray-300 text-gray-600'"
            >
              <div class="text-center">
                <div class="font-bold">Module Call</div>
                <div class="text-xs mt-1">Call a module API endpoint</div>
              </div>
            </button>
            <button
              @click="setStepType('chain_call')"
              class="flex-1 py-3 px-4 rounded-lg border-2 transition-all"
              :class="selectedStep.type === 'chain_call'
                ? 'border-purple-500 bg-purple-50 text-purple-700 font-semibold'
                : 'border-gray-200 hover:border-gray-300 text-gray-600'"
            >
              <div class="text-center">
                <div class="font-bold">Invoke Chain</div>
                <div class="text-xs mt-1">Execute another saved chain</div>
              </div>
            </button>
          </div>
        </div>

        <!-- Module Call Configuration -->
        <template v-if="!selectedStep.type || selectedStep.type === 'module_call'">
          <!-- Module & Endpoint -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Module</label>
              <select v-model="selectedStep.module" class="input" @change="onModuleChange">
                <option value="intent">Intent Interpreter</option>
                <option value="character">Character Controller</option>
                <option value="scene">Scene Controller</option>
                <option value="item">Item Controller</option>
                <option value="storyteller">StoryTeller</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Endpoint</label>
              <select v-model="selectedStep.endpoint" class="input" @change="onEndpointChange">
                <option value="" disabled>Select an endpoint...</option>
                <option
                  v-for="endpoint in availableEndpoints"
                  :key="endpoint.path"
                  :value="endpoint.path"
                >
                  {{ endpoint.method }} {{ endpoint.path }} - {{ endpoint.description }}
                </option>
              </select>
            </div>
          </div>

        <!-- Endpoint Info -->
          <div v-if="selectedEndpointMetadata" class="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-gray-700">{{ selectedEndpointMetadata.description }}</span>
              <div class="flex items-center space-x-2">
                <button
                  @click="onEndpointChange"
                  class="btn btn-secondary btn-sm text-xs"
                  title="Reset to template values"
                >
                  ↻ Reset
                </button>
                <span
                  class="badge text-xs"
                  :class="{
                    'bg-blue-100 text-blue-800': selectedEndpointMetadata.method === 'GET',
                    'bg-green-100 text-green-800': selectedEndpointMetadata.method === 'POST',
                    'bg-yellow-100 text-yellow-800': selectedEndpointMetadata.method === 'PATCH',
                    'bg-red-100 text-red-800': selectedEndpointMetadata.method === 'DELETE',
                  }"
                >
                  {{ selectedEndpointMetadata.method }}
                </span>
              </div>
            </div>
            <div v-if="selectedEndpointMetadata.params && selectedEndpointMetadata.params.length > 0" class="text-xs text-gray-600 mt-2">
              <strong>Parameters:</strong>
              <span
                v-for="param in selectedEndpointMetadata.params"
                :key="param.name"
                class="ml-2"
              >
                <code class="bg-gray-200 px-1 rounded">{{ param.name }}</code><span v-if="param.required" class="text-red-600">*</span>
              </span>
            </div>
            <div v-if="selectedEndpointMetadata.body && selectedEndpointMetadata.body.length > 0" class="text-xs text-gray-600 mt-1">
              <strong>Body Fields:</strong>
              <span
                v-for="field in selectedEndpointMetadata.body"
                :key="field.name"
                class="ml-2"
              >
                <code class="bg-gray-200 px-1 rounded">{{ field.name }}</code><span v-if="field.required" class="text-red-600">*</span>
              </span>
            </div>
          </div>

          <!-- Parameters -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-sm font-medium text-gray-700">
                Query Parameters (JSON)
              </label>
              <button
                @click="openParamsEditor"
                class="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center space-x-1"
              >
                <span>✏️</span>
                <span>Open Editor</span>
              </button>
            </div>
            <textarea
              v-model="paramsJson"
              class="input font-mono text-sm"
              rows="4"
              placeholder='{"userId": "{{input.userId}}", "name": "{{input.characterName}}"}'
            ></textarea>
          </div>

          <!-- Body -->
          <div v-if="['POST', 'PATCH', 'PUT'].includes(selectedStep.method)">
            <div class="flex items-center justify-between mb-1">
              <label class="text-sm font-medium text-gray-700">
                Request Body (JSON)
              </label>
              <button
                @click="openBodyEditor"
                class="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center space-x-1"
              >
                <span>✏️</span>
                <span>Open Editor</span>
              </button>
            </div>
            <textarea
              v-model="bodyJson"
              class="input font-mono text-sm"
              rows="6"
              placeholder='{"message": "{{input.message}}"}'
            ></textarea>
          </div>

          <!-- Variable Helper -->
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div class="flex items-center justify-between mb-2">
              <h3 class="font-medium text-blue-900">Variable Reference</h3>
              <div class="flex items-center space-x-2">
                <span v-if="testResult" class="badge bg-green-100 text-green-800 text-xs">
                  ✓ Test data available
                </span>
                <span v-else-if="!selectedStep || selectedStep.type === 'chain_call'" class="badge bg-gray-100 text-gray-600 text-xs">
                  No test run yet
                </span>
                <span v-else-if="getCachedStructure(selectedStep)" class="badge bg-purple-100 text-purple-800 text-xs">
                  💾 Cached structure available
                </span>
                <span v-else class="badge bg-gray-100 text-gray-600 text-xs">
                  No test run yet
                </span>
              </div>
            </div>

            <!-- Basic Examples -->
            <div class="text-sm text-blue-800 space-y-1 mb-3">
              <div>
                <code class="bg-blue-100 px-1 rounded" v-text="variableExamples.input"></code>
                - Access input data
              </div>
              <div>
                <code class="bg-blue-100 px-1 rounded" v-text="variableExamples.step"></code>
                - Access previous step response
              </div>
              <div>
                <code class="bg-blue-100 px-1 rounded" v-text="variableExamples.env"></code>
                - Access environment variable
              </div>
            </div>

            <!-- Test Results from Previous Steps -->
            <div v-if="testResult && selectedStepIndex !== null && selectedStepIndex > 0" class="mt-4 border-t border-blue-300 pt-3">
              <h4 class="font-medium text-blue-900 mb-2">Available from Previous Steps:</h4>
              <div class="space-y-3 max-h-64 overflow-y-auto">
                <div
                  v-for="(stepResult, index) in testResult.steps.slice(0, selectedStepIndex)"
                  :key="index"
                  class="bg-white rounded p-2 text-xs"
                >
                  <div class="font-medium text-gray-700 mb-1">
                    Step {{ index + 1 }}: {{ stepResult.step_name || stepResult.step_id }}
                    <span :class="`badge badge-${stepResult.module} ml-1`">{{ stepResult.module }}</span>
                  </div>

                  <div v-if="stepResult.response" class="space-y-1">
                    <div class="text-gray-600 font-medium">Available Fields:</div>
                    <div class="space-y-1">
                      <div
                        v-for="path in getAvailablePaths(stepResult.response, stepResult.step_id)"
                        :key="path.full"
                        class="flex items-center justify-between hover:bg-blue-50 p-1 rounded group"
                      >
                        <div class="flex-1">
                          <code class="text-xs bg-gray-100 px-1 rounded">{{ path.full }}</code>
                          <span class="text-gray-500 ml-2">= {{ formatValue(path.value) }}</span>
                        </div>
                        <button
                          @click="insertVariable(path.full)"
                          class="btn btn-sm px-2 py-0 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Insert variable"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  <details v-if="stepResult.response" class="mt-2">
                    <summary class="cursor-pointer text-blue-600 hover:text-blue-700">View Full Response</summary>
                    <pre class="bg-gray-900 text-gray-100 p-2 rounded mt-1 text-xs overflow-x-auto">{{ JSON.stringify(stepResult.response, null, 2) }}</pre>
                  </details>
                </div>
              </div>
            </div>

            <!-- Input Data from Last Test -->
            <div v-if="testResult && lastTestInput" class="mt-4 border-t border-blue-300 pt-3">
              <h4 class="font-medium text-blue-900 mb-2">Input Data (from last test):</h4>
              <div class="bg-white rounded p-2 text-xs space-y-1">
                <div
                  v-for="path in getAvailablePaths(lastTestInput, 'input')"
                  :key="path.full"
                  class="flex items-center justify-between hover:bg-blue-50 p-1 rounded group"
                >
                  <div class="flex-1">
                    <code class="text-xs bg-gray-100 px-1 rounded">{{ path.full }}</code>
                    <span class="text-gray-500 ml-2">= {{ formatValue(path.value) }}</span>
                  </div>
                  <button
                    @click="insertVariable(path.full)"
                    class="btn btn-sm px-2 py-0 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Insert variable"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- Conditional Routing Section (New) -->
        <!-- Conditional Routing Section (all steps) -->
        <div class="border border-orange-300 bg-orange-50 rounded-lg p-4 space-y-4">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center space-x-2">
              <span class="text-lg font-bold text-orange-800">⚡ Conditional Routing</span>
              <span class="badge bg-orange-100 text-orange-800 text-xs">Optional</span>
            </div>
            <div class="flex items-center space-x-2">
              <button @click="showTemplatesModal = true" class="btn btn-secondary btn-sm">📋 Templates</button>
              <button @click="addRoutingRule" class="btn btn-primary btn-sm">+ Add Rule</button>
            </div>
          </div>

          <div class="text-sm text-gray-700 mb-3">
            Define routing rules that execute after this step completes. Rules are evaluated in order; the first matching rule determines the next action.
          </div>

          <!-- Routing Rules List -->
          <div v-if="!(selectedStep as any).conditionalRouting || (selectedStep as any).conditionalRouting.length === 0" class="text-center py-8 bg-white rounded border-2 border-dashed border-gray-300">
            <p class="text-gray-500 mb-2">No routing rules yet</p>
            <p class="text-xs text-gray-400">Add a rule to control flow based on step results</p>
          </div>

          <div v-else class="space-y-3">
            <div v-for="(rule, index) in (selectedStep as any).conditionalRouting" :key="rule.id || index" class="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
              <div class="flex items-center justify-between">
                <span class="font-medium text-gray-700">Rule {{ index + 1 }}</span>
                <div class="flex items-center space-x-2">
                  <button
                    v-if="testResult"
                    @click="testRoutingRule(rule)"
                    class="btn btn-secondary btn-sm text-xs"
                    title="Test this rule with last execution data"
                  >
                    🧪 Test
                  </button>
                  <button @click="removeRoutingRule(index)" class="text-red-500 hover:text-red-700 text-sm">Remove</button>
                </div>
              </div>

              <!-- Test Result Display -->
              <div v-if="rule.testResult !== undefined" :class="['text-xs rounded p-2', rule.testResult ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600']">
                <span class="font-bold">Test Result:</span>
                {{ rule.testResult ? '✓ Condition MATCHES - Rule would execute' : '✗ Condition does NOT match - Rule would be skipped' }}
              </div>

              <!-- Description -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input v-model="rule.description" type="text" class="input text-sm" placeholder="Brief description of this rule..." />
              </div>

              <!-- Condition -->
              <div class="bg-gray-50 rounded p-3 space-y-2">
                <label class="block text-sm font-medium text-gray-700">Condition</label>
                <div class="grid grid-cols-3 gap-2">
                  <input v-model="rule.condition.field" type="text" class="input font-mono text-xs" placeholder="step_1.success" />
                  <select v-model="rule.condition.operator" class="input text-xs">
                    <option value="equals">==</option>
                    <option value="not_equals">!=</option>
                    <option value="contains">Contains</option>
                    <option value="greater_than">&gt;</option>
                    <option value="less_than">&lt;</option>
                    <option value="exists">Exists</option>
                    <option value="not_exists">Not Exists</option>
                  </select>
                  <input v-if="!['exists', 'not_exists'].includes(rule.condition.operator)" v-model="rule.condition.value" type="text" class="input text-xs" placeholder="value" />
                </div>
              </div>

              <!-- Action -->
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Action</label>
                  <select v-model="rule.action" class="input text-sm">
                    <option value="skip_to_step">Skip to Step</option>
                    <option value="jump_to_chain">Jump to Chain</option>
                    <option value="stop_chain">Stop Chain</option>
                  </select>
                </div>

                <!-- Target Selection -->
                <div v-if="rule.action === 'skip_to_step'">
                  <label class="block text-sm font-medium text-gray-700 mb-1">Target Step</label>
                  <select v-model="rule.target" class="input text-sm">
                    <option value="" disabled>Select step...</option>
                    <option v-for="(step, stepIndex) in steps" :key="step.id" :value="step.id">Step {{ stepIndex + 1 }}: {{ step.name || step.id }}</option>
                  </select>
                </div>

                <div v-else-if="rule.action === 'jump_to_chain'">
                  <label class="block text-sm font-medium text-gray-700 mb-1">Target Chain</label>
                  <select v-model="rule.target" class="input text-sm" @change="onRoutingChainSelect(rule)">
                    <option :value="0" disabled>Select chain...</option>
                    <option v-for="chain in availableChains" :key="chain.id" :value="chain.id">{{ chain.name }}</option>
                  </select>
                </div>
              </div>

              <!-- Input Mapping for jump_to_chain -->
              <div v-if="rule.action === 'jump_to_chain'" class="bg-gray-50 rounded p-3 space-y-2">
                <!-- Show target chain's expected inputs -->
                <div v-if="rule.target && rule.target !== 0" class="mb-3 bg-purple-50 border border-purple-200 rounded p-2">
                  <div class="text-xs font-medium text-purple-900 mb-1">
                    📥 Target Chain Expected Inputs
                  </div>
                  <div class="text-xs text-purple-800">
                    <template v-if="getChainInputFieldsForRule(rule.target).length > 0">
                      <span v-for="(field, fieldIdx) in getChainInputFieldsForRule(rule.target)" :key="fieldIdx" class="inline-block mr-2 mb-1">
                        <code class="bg-white px-1 rounded">{{ field }}</code>
                      </span>
                    </template>
                    <span v-else class="italic text-purple-600">No input fields detected</span>
                  </div>
                </div>

                <div class="flex items-center justify-between mb-1">
                  <label class="text-sm font-medium text-gray-700">Input Mapping (JSON)</label>
                  <button
                    @click="openJsonEditor('Edit Routing Input Mapping', rule.input_mapping_json || '{}', (value) => { rule.input_mapping_json = value; updateRoutingInputMapping(rule); })"
                    class="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center space-x-1"
                  >
                    <span>✏️</span>
                    <span>Open Editor</span>
                  </button>
                </div>
                <textarea
                  v-model="rule.input_mapping_json"
                  class="input font-mono text-xs"
                  rows="4"
                  placeholder='{\n  "field1": "{{step_1.result}}",\n  "field2": "{{input.value}}"\n}'
                  @blur="updateRoutingInputMapping(rule)"
                  :id="`routing-mapping-${index}`"
                ></textarea>
                <div class="text-xs text-gray-500">
                  Map data from the current context to the target chain's input using variable syntax like <code v-pre>{{step_1.field}}</code>
                </div>

                <!-- Variable Helper for Input Mapping -->
                <div v-if="testResult && testResult.steps.length > 0" class="bg-blue-50 border border-blue-200 rounded p-3 mt-2">
                  <div class="text-xs font-medium text-blue-900 mb-2">Available Variables (from last test)</div>
                  <details class="text-xs">
                    <summary class="cursor-pointer text-blue-700 hover:text-blue-800 font-medium mb-2">
                      Show {{ testResult.steps.length }} step{{ testResult.steps.length > 1 ? 's' : '' }} + input variables
                    </summary>
                    <div class="space-y-2 max-h-48 overflow-y-auto mt-2">
                      <!-- Input variables -->
                      <div v-if="lastTestInput" class="bg-white rounded p-2">
                        <div class="font-medium text-gray-700 mb-1">Input Data</div>
                        <div class="space-y-1">
                          <div
                            v-for="path in getAvailablePaths(lastTestInput, 'input')"
                            :key="path.full"
                            class="flex items-center justify-between hover:bg-blue-50 p-1 rounded group"
                          >
                            <div class="flex-1">
                              <code class="text-xs bg-gray-100 px-1 rounded">{{ path.full }}</code>
                              <span class="text-gray-500 ml-1">= {{ formatValue(path.value) }}</span>
                            </div>
                            <button
                              @click="insertVariableIntoRoutingMapping(path.full, `routing-mapping-${index}`, rule)"
                              class="btn btn-sm px-2 py-0 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Insert variable"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>

                      <!-- Step results -->
                      <div
                        v-for="(stepResult, stepIdx) in testResult.steps"
                        :key="stepIdx"
                        class="bg-white rounded p-2"
                      >
                        <div class="font-medium text-gray-700 mb-1">
                          Step {{ stepIdx + 1 }}: {{ stepResult.step_name || stepResult.step_id }}
                          <span :class="`badge badge-${stepResult.module || 'primary'} ml-1`">{{ stepResult.module || 'chain_call' }}</span>
                        </div>
                        <div v-if="stepResult.response" class="space-y-1">
                          <div
                            v-for="path in getAvailablePaths(stepResult.response, stepResult.step_id)"
                            :key="path.full"
                            class="flex items-center justify-between hover:bg-blue-50 p-1 rounded group"
                          >
                            <div class="flex-1">
                              <code class="text-xs bg-gray-100 px-1 rounded">{{ path.full }}</code>
                              <span class="text-gray-500 ml-1">= {{ formatValue(path.value) }}</span>
                            </div>
                            <button
                              @click="insertVariableIntoRoutingMapping(path.full, `routing-mapping-${index}`, rule)"
                              class="btn btn-sm px-2 py-0 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Insert variable"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </details>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Chain Call Configuration -->
        <template v-if="selectedStep.type === 'chain_call'">
          <!-- Chain Selection -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Select Chain</label>
            <select v-model="selectedStep.chain_id" class="input" @change="onChainSelect">
              <option :value="0" disabled>Select a chain to invoke...</option>
              <option
                v-for="chain in availableChains"
                :key="chain.id"
                :value="chain.id"
              >
                {{ chain.name }} (ID: {{ chain.id }})
              </option>
            </select>
            <div class="text-xs text-gray-500 mt-1">
              Execute another saved chain and use its output in subsequent steps
            </div>
          </div>

          <!-- Selected Chain Details -->
          <div v-if="selectedChainInfo" class="space-y-4">
            <!-- Chain Info Card -->
            <div class="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div class="flex items-center justify-between mb-3">
                <div>
                  <div class="font-bold text-gray-800">{{ selectedChainInfo.name }}</div>
                  <div class="text-sm text-gray-600 mt-1">{{ selectedChainInfo.description || 'No description' }}</div>
                </div>
                <span class="badge bg-purple-100 text-purple-800">
                  {{ selectedChainInfo.steps.length }} steps
                </span>
              </div>

              <!-- Input Layout -->
              <div class="mb-3">
                <h4 class="text-sm font-bold text-gray-700 mb-2">📥 Expected Input</h4>
                <div class="bg-white rounded p-3 border border-purple-200">
                  <div v-if="getChainInputFields(selectedChainInfo).length > 0" class="space-y-1">
                    <div
                      v-for="field in getChainInputFields(selectedChainInfo)"
                      :key="field"
                      class="text-xs font-mono"
                    >
                      <span class="text-purple-600">{{ field }}</span>
                      <span class="text-gray-500 ml-2">(detected from chain steps)</span>
                    </div>
                  </div>
                  <div v-else class="text-xs text-gray-500 italic">
                    No input fields detected - chain may not use input variables
                  </div>
                </div>
              </div>

              <!-- Output Layout -->
              <div>
                <h4 class="text-sm font-bold text-gray-700 mb-2">📤 Output Structure</h4>
                <div class="bg-white rounded p-3 border border-purple-200">
                  <div v-if="selectedChainInfo.output_template" class="text-xs font-mono">
                    <pre class="text-gray-700">{{ JSON.stringify(selectedChainInfo.output_template, null, 2) }}</pre>
                  </div>
                  <div v-else class="text-xs text-gray-500 italic">
                    No output template defined - chain will return raw step results
                  </div>
                </div>
              </div>
            </div>

            <!-- Input Mapping -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-sm font-medium text-gray-700">
                  Input Mapping (JSON)
                </label>
                <button
                  @click="openChainInputMappingEditor"
                  class="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center space-x-1"
                >
                  <span>✏️</span>
                  <span>Open Editor</span>
                </button>
              </div>
              <textarea
                v-model="chainInputMappingJson"
                class="input font-mono text-sm"
                rows="6"
                placeholder='{"userId": "{{input.userId}}", "message": "{{step_1.result}}"}'
              ></textarea>
              <div class="text-xs text-gray-600 mt-1">
                Map variables from current context to the sub-chain's input fields above
              </div>
            </div>

            <!-- Variable Helper -->
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div class="text-sm font-medium text-blue-900 mb-2">Available Variables</div>
              <div class="text-xs text-blue-800 space-y-1">
                <div><code class="bg-white px-1 rounded" v-text="'{{input.field}}'"></code> - Current chain input</div>
                <div><code class="bg-white px-1 rounded" v-text="'{{step_N.field}}'"></code> - Previous step results</div>
                <div><code class="bg-white px-1 rounded" v-text="'{{env.VAR}}'"></code> - Environment variables</div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

        <!-- Placeholder when no step is selected -->
        <div v-else class="card bg-gray-50 border-2 border-dashed border-gray-300">
          <div class="text-center py-12">
            <p class="text-gray-500 text-lg mb-2">No step selected</p>
            <p class="text-gray-400 text-sm">Click on a step from the left panel to configure it</p>
          </div>
        </div>

        <!-- Output Builder -->
        <div class="card">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold">Output Builder</h2>
            <span class="badge bg-purple-100 text-purple-800 text-xs">Optional</span>
          </div>

          <div class="text-sm text-gray-600 mb-4">
            Define the final output structure for this chain. Use variable syntax like <code class="bg-gray-100 px-1 rounded" v-text="'{{step_1.field}}'"></code> to include data from any step. If not specified, the chain will return all step results.
          </div>

          <div class="space-y-4">
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-sm font-medium text-gray-700">
                  Output Template (JSON)
                </label>
                <button
                  @click="openOutputTemplateEditor"
                  class="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center space-x-1"
                >
                  <span>✏️</span>
                  <span>Open Editor</span>
                </button>
              </div>
              <textarea
                v-model="outputTemplateJson"
                class="input font-mono text-sm"
                rows="10"
                placeholder='{\n  "characterName": "{{step_1.name}}",\n  "intent": "{{step_2.primaryIntent.type}}",\n  "location": "{{step_3.position}}"\n}'
              ></textarea>
            </div>

            <!-- Example output templates -->
            <details class="text-sm">
              <summary class="cursor-pointer text-primary-600 hover:text-primary-700 font-medium">
                View Example Templates
              </summary>
              <div class="mt-3 space-y-3 bg-gray-50 p-3 rounded">
                <div>
                  <div class="font-medium text-gray-700 mb-1">Simple Output:</div>
                  <pre v-pre class="bg-gray-900 text-gray-100 p-2 rounded text-xs overflow-x-auto">{
  "character": "{{step_1.name}}",
  "location": "{{step_2.location_name}}",
  "intent": "{{step_3.result.primaryIntent.type}}"
}</pre>
                </div>
                <div>
                  <div class="font-medium text-gray-700 mb-1">Nested Structure:</div>
                  <pre v-pre class="bg-gray-900 text-gray-100 p-2 rounded text-xs overflow-x-auto">{
  "player": {
    "name": "{{step_1.name}}",
    "class": "{{step_1.class}}",
    "level": "{{step_1.level}}"
  },
  "action": {
    "intent": "{{step_2.primaryIntent.type}}",
    "confidence": "{{step_2.primaryIntent.confidence}}",
    "target": "{{step_2.entities.target}}"
  },
  "context": {
    "location": "{{step_3.location_name}}",
    "nearby": "{{step_3.nearby_locations}}"
  }
}</pre>
                </div>
                <div>
                  <div class="font-medium text-gray-700 mb-1">Array Access:</div>
                  <pre v-pre class="bg-gray-900 text-gray-100 p-2 rounded text-xs overflow-x-auto">{
  "firstCharacter": "{{step_1.characters[0]}}",
  "topIntent": "{{step_2.intents[0].type}}",
  "allCharacters": "{{step_1.characters}}"
}</pre>
                </div>
              </div>
            </details>

            <!-- Variable Helper for Output -->
            <div v-if="testResult && testResult.steps.length > 0" class="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div class="flex items-center justify-between mb-2">
                <h3 class="font-medium text-blue-900">Available Variables (from last test)</h3>
                <span class="badge bg-green-100 text-green-800 text-xs">✓ Test data available</span>
              </div>

              <div class="space-y-3 max-h-64 overflow-y-auto">
                <div
                  v-for="(stepResult, index) in testResult.steps"
                  :key="index"
                  class="bg-white rounded p-2 text-xs"
                >
                  <div class="font-medium text-gray-700 mb-1">
                    Step {{ index + 1 }}: {{ stepResult.step_name || stepResult.step_id }}
                    <span :class="`badge badge-${stepResult.module || 'primary'} ml-1`">{{ stepResult.step_type || 'module_call' }}</span>
                  </div>

                  <div v-if="stepResult.response" class="space-y-1">
                    <div
                      v-for="path in getAvailablePaths(stepResult.response, stepResult.step_id)"
                      :key="path.full"
                      class="flex items-center justify-between hover:bg-blue-50 p-1 rounded group"
                    >
                      <div class="flex-1">
                        <code class="text-xs bg-gray-100 px-1 rounded">{{ path.full }}</code>
                        <span class="text-gray-500 ml-2">= {{ formatValue(path.value) }}</span>
                      </div>
                      <button
                        @click="insertVariableIntoOutput(path.full)"
                        class="btn btn-sm px-2 py-0 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Insert into output template"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- JSON Editor Modal -->
    <div v-if="showJsonEditorModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="closeJsonEditor">
      <div class="bg-white rounded-lg shadow-xl w-full m-4 max-h-[90vh] flex flex-col" style="max-width: 1200px;">
        <div class="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 class="text-xl font-bold">{{ jsonEditorTitle }}</h2>
          <button @click="closeJsonEditor" class="text-gray-400 hover:text-gray-600 text-2xl">✕</button>
        </div>

        <div class="flex-1 flex overflow-hidden">
          <!-- Left: JSON Editor -->
          <div class="flex-1 flex flex-col p-4 border-r border-gray-200">
            <div class="flex items-center justify-between mb-2">
              <label class="text-sm font-medium text-gray-700">JSON Content</label>
              <div class="text-xs text-gray-500">Click on a variable to insert it at cursor position</div>
            </div>
            <textarea
              id="json-editor-textarea"
              v-model="jsonEditorContent"
              class="flex-1 input font-mono text-sm resize-none"
              placeholder='{\n  "field": "{{variable}}"\n}'
              @click="jsonEditorCursorPosition = ($event.target as HTMLTextAreaElement).selectionStart"
              @keyup="jsonEditorCursorPosition = ($event.target as HTMLTextAreaElement).selectionStart"
              @keydown="handleJsonEditorKeydown"
              spellcheck="false"
            ></textarea>
            <div class="mt-2 flex items-center justify-between">
              <div class="text-xs text-gray-500">
                Use <code class="bg-gray-100 px-1 rounded" v-pre>{{variable}}</code> syntax to reference step outputs and input data
              </div>
              <div class="text-xs text-gray-400 italic">
                Supports Ctrl+Z/Y for undo/redo
              </div>
            </div>
          </div>

          <!-- Right: Variable Picker -->
          <div class="w-96 flex flex-col p-4 bg-gray-50">
            <div class="mb-3">
              <div class="flex items-center justify-between mb-1">
                <h3 class="text-sm font-bold text-gray-800">📦 Available Variables</h3>
                <button
                  v-if="Object.keys(endpointStructureCache).length > 0"
                  @click="clearEndpointCache"
                  class="text-xs text-red-600 hover:text-red-700"
                  title="Clear cached endpoint structures"
                >
                  Clear Cache
                </button>
              </div>
              <p class="text-xs text-gray-600">Click any variable to insert it into the JSON editor</p>
              <div v-if="Object.keys(endpointStructureCache).length > 0" class="mt-1 text-xs text-green-600">
                💾 {{ Object.keys(endpointStructureCache).length }} endpoint{{ Object.keys(endpointStructureCache).length > 1 ? 's' : '' }} cached
              </div>
            </div>

            <div class="flex-1 overflow-y-auto space-y-3">
              <div v-if="getAvailableVariablesForEditor().length === 0" class="text-center py-8 text-gray-500">
                <p class="text-sm mb-2">No variables available yet</p>
                <p class="text-xs">Run a test execution to see available variables</p>
              </div>

              <div v-for="(category, catIdx) in getAvailableVariablesForEditor()" :key="catIdx" class="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div class="bg-gray-100 px-3 py-2 border-b border-gray-200">
                  <div class="text-xs font-bold text-gray-700">{{ category.category }}</div>
                </div>
                <div class="divide-y divide-gray-100">
                  <!-- Render hierarchical variable tree (recursive) -->
                  <VariableTreeNode
                    v-for="(node, nodeIdx) in category.nodes"
                    :key="`${catIdx}-${nodeIdx}`"
                    :node="node"
                    :is-expanded="isPathExpanded(node.path)"
                    :expanded-paths="expandedPaths"
                    @toggle="togglePathExpansion"
                    @insert="insertVariableIntoJsonEditor"
                  />
                </div>
              </div>

              <!-- Environment Variables Section -->
              <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div class="bg-gray-100 px-3 py-2 border-b border-gray-200">
                  <div class="text-xs font-bold text-gray-700">Environment Variables</div>
                </div>
                <div class="px-3 py-2 hover:bg-blue-50 cursor-pointer transition-colors group" @click="insertVariableIntoJsonEditor('{{env.VARIABLE_NAME}}')">
                  <div class="flex items-center justify-between">
                    <div class="flex-1">
                      <div class="text-xs font-medium text-gray-800 font-mono">env.*</div>
                      <div class="text-xs text-gray-500 mt-0.5">Environment variable</div>
                    </div>
                    <div class="ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span class="text-blue-600 text-xs font-bold">+</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="p-4 border-t border-gray-200 flex justify-between items-center">
          <div class="flex items-center space-x-4 text-xs text-gray-600">
            <div class="flex items-center space-x-1">
              <kbd class="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs font-mono">Ctrl+S</kbd>
              <span>Save</span>
            </div>
            <div class="flex items-center space-x-1">
              <kbd class="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs font-mono">Esc</kbd>
              <span>Close</span>
            </div>
            <div class="flex items-center space-x-1">
              <kbd class="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs font-mono">Tab</kbd>
              <span>Indent</span>
            </div>
            <div class="flex items-center space-x-1">
              <kbd class="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs font-mono">Ctrl+Z</kbd>
              <span>Undo</span>
            </div>
          </div>
          <div class="flex space-x-3">
            <button @click="closeJsonEditor" class="btn btn-secondary">Cancel</button>
            <button @click="saveJsonEditor" class="btn btn-primary">Save Changes</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Routing Templates Modal -->
    <div v-if="showTemplatesModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="showTemplatesModal = false">
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full m-4 max-h-[80vh] overflow-auto">
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-2xl font-bold">Routing Rule Templates</h2>
            <button @click="showTemplatesModal = false" class="text-gray-400 hover:text-gray-600 text-2xl">✕</button>
          </div>

          <div class="text-sm text-gray-600 mb-4">
            Choose a template to quickly create a common routing pattern. You can customize it after applying.
          </div>

          <div class="space-y-3">
            <div
              v-for="(template, index) in routingTemplates"
              :key="index"
              class="border border-gray-200 rounded-lg p-4 hover:border-orange-300 hover:bg-orange-50 transition-colors cursor-pointer"
              @click="applyRoutingTemplate(template)"
            >
              <div class="flex items-start justify-between mb-2">
                <div class="flex-1">
                  <div class="font-bold text-gray-800">{{ template.name }}</div>
                  <div class="text-sm text-gray-600 mt-1">{{ template.description }}</div>
                </div>
                <button class="btn btn-primary btn-sm">Apply</button>
              </div>

              <div class="mt-3 bg-gray-50 rounded p-3 text-xs font-mono">
                <div class="text-gray-700 mb-1">
                  <span class="font-bold">Condition:</span> {{ template.rule.condition.field || '(field)' }} {{ template.rule.condition.operator }} {{ template.rule.condition.value }}
                </div>
                <div class="text-gray-700">
                  <span class="font-bold">Action:</span> {{ template.rule.action }}
                  <span v-if="template.rule.target"> → {{ template.rule.target }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="flex justify-end mt-6">
            <button @click="showTemplatesModal = false" class="btn btn-secondary">Cancel</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Test Modal -->
    <div v-if="showTestModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="closeTestModal">
      <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full m-4 max-h-[90vh] overflow-auto">
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-2xl font-bold">Test Chain</h2>
            <button @click="closeTestModal" class="text-gray-400 hover:text-gray-600 text-2xl">✕</button>
          </div>

          <div v-if="!testResult" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Input Data (JSON)</label>
              <textarea
                v-model="testInput"
                class="input font-mono text-sm"
                rows="8"
                placeholder='{"userId": "admin", "characterName": "Thorin", "message": "I attack"}'
              ></textarea>
            </div>
            <button @click="executeTest" class="btn btn-primary w-full" :disabled="testLoading">
              {{ testLoading ? 'Executing...' : 'Execute Chain' }}
            </button>
          </div>

          <div v-else>
            <div :class="['card mb-4', testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200']">
              <div class="flex items-center justify-between">
                <span class="text-lg font-bold">
                  {{ testResult.success ? '✓ Success' : '✗ Failed' }}
                </span>
                <span class="text-sm text-gray-600">{{ testResult.total_duration_ms }}ms</span>
              </div>
              <div v-if="testResult.error" class="mt-2 text-red-800">{{ testResult.error }}</div>
            </div>

            <div class="space-y-4">
              <div v-for="(stepResult, index) in testResult.steps" :key="index" class="border border-gray-200 rounded-lg p-4">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center space-x-2">
                    <span class="font-medium">Step {{ index + 1 }}: {{ stepResult.step_name || stepResult.step_id }}</span>
                    <span :class="`badge badge-${stepResult.module}`">{{ stepResult.module }}</span>
                  </div>
                  <div class="flex items-center space-x-2">
                    <span :class="['badge', stepResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800']">
                      {{ stepResult.success ? 'Success' : 'Failed' }}
                    </span>
                    <span class="text-sm text-gray-500">{{ stepResult.duration_ms }}ms</span>
                  </div>
                </div>
                <div class="text-sm text-gray-600 mb-2">
                  {{ stepResult.method }} {{ stepResult.endpoint }}
                </div>

                <!-- Routing Analytics -->
                <div v-if="stepResult.routing_evaluated" class="mt-3 bg-orange-50 border border-orange-200 rounded p-3">
                  <div class="flex items-center space-x-2 mb-2">
                    <span class="text-sm font-bold text-orange-800">⚡ Routing Evaluated</span>
                  </div>
                  <div v-if="stepResult.routing_action_taken" class="text-xs space-y-1">
                    <div class="flex items-center space-x-2">
                      <span class="font-medium text-green-700">✓ Rule Matched</span>
                    </div>
                    <div class="text-gray-700">
                      <span class="font-medium">Action:</span> {{ stepResult.routing_action_taken }}
                    </div>
                    <div v-if="stepResult.routing_matched?.description" class="text-gray-600 italic">
                      {{ stepResult.routing_matched.description }}
                    </div>
                  </div>
                  <div v-else class="text-xs text-gray-600">
                    No routing rules matched - continuing to next step
                  </div>
                </div>

                <details class="text-sm mt-2">
                  <summary class="cursor-pointer text-primary-600 hover:text-primary-700">View Response</summary>
                  <pre class="json-viewer mt-2">{{ JSON.stringify(stepResult.response, null, 2) }}</pre>
                </details>
              </div>
            </div>

            <!-- Final Output -->
            <div v-if="testResult.output" class="border-2 border-purple-300 bg-purple-50 rounded-lg p-4 mt-4">
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-lg font-bold text-purple-900">📤 Final Output</h3>
                <span class="badge bg-purple-200 text-purple-900 text-xs">From Output Template</span>
              </div>
              <pre class="json-viewer">{{ JSON.stringify(testResult.output, null, 2) }}</pre>
            </div>

            <div class="flex justify-end mt-4">
              <button @click="closeTestModal" class="btn btn-secondary">Close</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useChainStore } from '../stores/chainStore';
import { useExecutionStore } from '../stores/executionStore';
import { useModuleStore } from '../stores/moduleStore';
import type { ChainStep, ModuleEndpoint } from '../types';
import VariableTreeNode from '../components/VariableTreeNode.vue';

const route = useRoute();
const router = useRouter();
const chainStore = useChainStore();
const executionStore = useExecutionStore();
const moduleStore = useModuleStore();

// Chain details
const chainName = ref('New Chain');
const description = ref('');
const chainOwner = ref('admin'); // The user who owns this chain

// Input values for detected fields (used during execution)
const inputValues = ref<Record<string, string>>({
  userId: 'admin', // Always include userId by default
});

// Steps
const steps = ref<ChainStep[]>([]);
const selectedStepIndex = ref<number | null>(null);
const selectedStepPath = ref<any[] | null>(null); // Path to nested step [index] or [index, 'ifTrue', branchIndex]

// Output Template
const outputTemplate = ref<Record<string, any>>({});
const outputTemplateJson = ref('{}');

// Edit mode
const editMode = ref(false);
const editingChainId = ref<number | null>(null);

// Test modal
const showTestModal = ref(false);
const testInput = ref('{}');
const testLoading = ref(false);
const testResult = ref<any>(null);
const lastTestInput = ref<any>(null);

// Routing features
const showRoutingFlow = ref(false);
const testingRule = ref<any>(null);
const showTemplatesModal = ref(false);

// JSON Editor Modal
const showJsonEditorModal = ref(false);
const jsonEditorContent = ref('{}');
const jsonEditorTitle = ref('Edit JSON');
const jsonEditorCallback = ref<((value: string) => void) | null>(null);
const jsonEditorCursorPosition = ref(0);
const expandedPaths = ref<Set<string>>(new Set());

// Endpoint Response Structure Cache
interface EndpointStructure {
  module: string;
  endpoint: string;
  method: string;
  exampleResponse: any;
  fields: string[]; // List of all field paths ever seen
  lastUpdated: string;
}

const endpointStructureCache = ref<Record<string, EndpointStructure>>({});

// Load cache from localStorage on mount
function loadEndpointCache() {
  try {
    const cached = localStorage.getItem('aicontroller_endpoint_cache');
    if (cached) {
      endpointStructureCache.value = JSON.parse(cached);
    }
  } catch (e) {
    console.error('Failed to load endpoint cache:', e);
  }
}

// Save cache to localStorage
function saveEndpointCache() {
  try {
    localStorage.setItem('aicontroller_endpoint_cache', JSON.stringify(endpointStructureCache.value));
  } catch (e) {
    console.error('Failed to save endpoint cache:', e);
  }
}

// Extract all field paths from an object (recursive)
function extractFieldPaths(obj: any, prefix: string = '', maxDepth: number = 4, currentDepth: number = 0): string[] {
  const paths: string[] = [];

  if (currentDepth >= maxDepth || obj === null || obj === undefined) {
    return paths;
  }

  if (typeof obj === 'object' && !Array.isArray(obj)) {
    for (const key of Object.keys(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      paths.push(path);

      // Recursively extract nested paths
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        paths.push(...extractFieldPaths(obj[key], path, maxDepth, currentDepth + 1));
      }
    }
  } else if (Array.isArray(obj) && obj.length > 0) {
    // For arrays, extract paths from first item
    const path = prefix ? `${prefix}[0]` : '[0]';
    paths.push(path);
    paths.push(...extractFieldPaths(obj[0], path, maxDepth, currentDepth + 1));
  }

  return paths;
}

// Update endpoint cache with new response data
function updateEndpointCache(stepResult: any) {
  if (!stepResult.module || !stepResult.endpoint || !stepResult.response) {
    return;
  }

  const cacheKey = `${stepResult.module}:${stepResult.method}:${stepResult.endpoint}`;
  const existingCache = endpointStructureCache.value[cacheKey];

  // Extract field paths from the response
  const newFields = extractFieldPaths(stepResult.response);

  if (existingCache) {
    // Merge new fields with existing ones
    const mergedFields = Array.from(new Set([...existingCache.fields, ...newFields])).sort();

    endpointStructureCache.value[cacheKey] = {
      ...existingCache,
      exampleResponse: stepResult.response, // Update with latest example
      fields: mergedFields,
      lastUpdated: new Date().toISOString(),
    };
  } else {
    // Create new cache entry
    endpointStructureCache.value[cacheKey] = {
      module: stepResult.module,
      endpoint: stepResult.endpoint,
      method: stepResult.method,
      exampleResponse: stepResult.response,
      fields: newFields.sort(),
      lastUpdated: new Date().toISOString(),
    };
  }

  saveEndpointCache();
}

// Get cached structure for a step
function getCachedStructure(step: any): EndpointStructure | null {
  if (!step || step.type === 'chain_call' || !step.module || !step.endpoint) {
    return null;
  }

  const cacheKey = `${step.module}:${step.method}:${step.endpoint}`;
  return endpointStructureCache.value[cacheKey] || null;
}

// Clear endpoint cache
function clearEndpointCache() {
  if (confirm('Clear all cached endpoint structures? This will remove the variable dictionary until you run tests again.')) {
    endpointStructureCache.value = {};
    saveEndpointCache();
  }
}

// Variable examples for the helper section
const variableExamples = {
  input: '{{input.field}}',
  step: '{{step_1.result.field}}',
  env: '{{env.VARIABLE}}',
};

// Routing rule templates
const routingTemplates = [
  {
    name: 'Skip on Success',
    description: 'Skip error handling steps when operation succeeds',
    rule: {
      condition: { field: '', operator: 'equals', value: true },
      action: 'skip_to_step',
      target: '',
      description: 'Skip to next step if operation succeeds'
    }
  },
  {
    name: 'Jump to Error Handler',
    description: 'Jump to error handling chain on failure',
    rule: {
      condition: { field: '', operator: 'equals', value: false },
      action: 'jump_to_chain',
      target: 0,
      description: 'Jump to error handler chain on failure',
      input_mapping: { error: '{{step.error}}', userId: '{{input.userId}}' }
    }
  },
  {
    name: 'Stop on Low Confidence',
    description: 'Stop chain if confidence score is too low',
    rule: {
      condition: { field: '', operator: 'less_than', value: 0.5 },
      action: 'stop_chain',
      description: 'Stop if confidence below threshold'
    }
  },
  {
    name: 'Admin Only Route',
    description: 'Jump to admin chain if user is admin',
    rule: {
      condition: { field: '', operator: 'equals', value: true },
      action: 'jump_to_chain',
      target: 0,
      description: 'Route to admin features',
      input_mapping: { userId: '{{input.userId}}', data: '{{step.response}}' }
    }
  }
];

const selectedStep = computed(() => {
  if (!selectedStepPath.value) return null;
  return getStepByPath(selectedStepPath.value);
});

// Check if any step has routing rules
const hasAnyRoutingRules = computed(() => {
  return steps.value.some(step => {
    const routing = (step as any).conditionalRouting;
    return routing && routing.length > 0;
  });
});

// Helper: Get step by path
function getStepByPath(path: any[]): ChainStep | null {
  if (!path || path.length === 0) return null;

  let current: any = steps.value[path[0]];
  if (!current) return null;

  for (let i = 1; i < path.length; i++) {
    const segment = path[i];
    if (typeof segment === 'string') {
      // Branch name like 'ifTrue' or 'ifFalse'
      current = current[segment];
      if (!current) return null;
    } else if (typeof segment === 'number') {
      // Index within branch
      current = current[segment];
      if (!current) return null;
    }
  }

  return current;
}

const paramsJson = computed({
  get: () => JSON.stringify(selectedStep.value?.params || {}, null, 2),
  set: (value: string) => {
    if (selectedStep.value) {
      try {
        selectedStep.value.params = JSON.parse(value);
      } catch {}
    }
  },
});

const bodyJson = computed({
  get: () => JSON.stringify(selectedStep.value?.body || {}, null, 2),
  set: (value: string) => {
    if (selectedStep.value) {
      try {
        selectedStep.value.body = JSON.parse(value);
      } catch {}
    }
  },
});

const canSave = computed(() => {
  return chainName.value.trim() !== '' && chainOwner.value.trim() !== '' && steps.value.length > 0;
});

const canTest = computed(() => {
  return steps.value.length > 0;
});

// Available endpoints for the selected step's module
const availableEndpoints = computed(() => {
  if (!selectedStep.value) return [];
  const module = moduleStore.getModule(selectedStep.value.module);
  return module?.endpoints || [];
});

// Currently selected endpoint metadata
const selectedEndpointMetadata = computed((): ModuleEndpoint | null => {
  if (!selectedStep.value) return null;
  const endpoints = availableEndpoints.value;
  return endpoints.find(e => e.path === selectedStep.value?.endpoint) || null;
});

// Detect input fields used in all steps
const detectedInputFields = computed(() => {
  const fields = new Set<string>();

  // Always include userId
  fields.add('userId');

  // Scan all steps for {{input.*}} patterns
  steps.value.forEach(step => {
    // Scan params
    if (step.params) {
      const paramsStr = JSON.stringify(step.params);
      const matches = paramsStr.match(/\{\{input\.(\w+)\}\}/g);
      if (matches) {
        matches.forEach(match => {
          const field = match.replace(/\{\{input\.|}\}/g, '');
          fields.add(field);
        });
      }
    }

    // Scan body
    if (step.body) {
      const bodyStr = JSON.stringify(step.body);
      const matches = bodyStr.match(/\{\{input\.(\w+)\}\}/g);
      if (matches) {
        matches.forEach(match => {
          const field = match.replace(/\{\{input\.|}\}/g, '');
          fields.add(field);
        });
      }
    }

    // Scan conditional routing input mapping
    if (step.conditionalRouting && Array.isArray(step.conditionalRouting)) {
      step.conditionalRouting.forEach(rule => {
        if (rule.input_mapping) {
          const mappingStr = JSON.stringify(rule.input_mapping);
          const matches = mappingStr.match(/\{\{input\.(\w+)\}\}/g);
          if (matches) {
            matches.forEach(match => {
              const field = match.replace(/\{\{input\.|}\}/g, '');
              fields.add(field);
            });
          }
        }
      });
    }
  });

  // Scan output template for input variables
  if (outputTemplateJson.value && outputTemplateJson.value.trim() !== '{}' && outputTemplateJson.value.trim() !== '') {
    try {
      const template = JSON.parse(outputTemplateJson.value);
      const templateStr = JSON.stringify(template);
      const matches = templateStr.match(/\{\{input\.(\w+)\}\}/g);
      if (matches) {
        matches.forEach(match => {
          const field = match.replace(/\{\{input\.|}\}/g, '');
          fields.add(field);
        });
      }
    } catch (e) {
      // Ignore invalid JSON in output template
    }
  }

  return Array.from(fields).sort();
});

// Available chains for chain_call steps
const availableChains = computed(() => {
  return chainStore.chains.filter(c => c.id !== editingChainId.value);
});

// Selected chain info for chain_call steps
const selectedChainInfo = computed(() => {
  if (!selectedStep.value || selectedStep.value.type !== 'chain_call') return null;
  const chainId = (selectedStep.value as any).chain_id;
  return chainStore.chains.find(c => c.id === chainId) || null;
});

// Chain input mapping JSON for chain_call steps
const chainInputMappingJson = computed({
  get: () => {
    if (!selectedStep.value || selectedStep.value.type !== 'chain_call') return '{}';
    return JSON.stringify((selectedStep.value as any).input_mapping || {}, null, 2);
  },
  set: (value: string) => {
    if (selectedStep.value && selectedStep.value.type === 'chain_call') {
      try {
        (selectedStep.value as any).input_mapping = JSON.parse(value);
      } catch {}
    }
  },
});

// Helper: Check if condition is a logic group
// Routing Rules Management
function addRoutingRule() {
  if (!selectedStep.value) return;
  if (!(selectedStep.value as any).conditionalRouting) {
    (selectedStep.value as any).conditionalRouting = [];
  }
  (selectedStep.value as any).conditionalRouting.push({
    id: `rule_${Date.now()}`,
    condition: { field: '', operator: 'equals', value: '' },
    action: 'skip_to_step',
    target: '',
    description: '',
    input_mapping: {},
    input_mapping_json: '{}' // UI helper for JSON editing
  });
}

function removeRoutingRule(index: number) {
  if (!selectedStep.value || !(selectedStep.value as any).conditionalRouting) return;
  if (confirm('Remove this routing rule?')) {
    (selectedStep.value as any).conditionalRouting.splice(index, 1);
  }
}

function updateRoutingInputMapping(rule: any) {
  try {
    rule.input_mapping = JSON.parse(rule.input_mapping_json || '{}');
  } catch (e) {
    console.warn('Invalid JSON in input mapping:', e);
  }
}

// Process loaded steps to ensure UI helper fields are initialized
function processLoadedSteps(loadedSteps: any[]) {
  return loadedSteps.map(step => {
    // Ensure conditional routing rules have proper input_mapping_json
    if (step.conditionalRouting && Array.isArray(step.conditionalRouting)) {
      step.conditionalRouting = step.conditionalRouting.map((rule: any) => ({
        ...rule,
        input_mapping_json: JSON.stringify(rule.input_mapping || {}, null, 2)
      }));
    }
    return step;
  });
}

// Clean steps for saving (remove UI helper fields)
function cleanStepsForSaving(stepsToClean: any[]) {
  return stepsToClean.map(step => {
    const cleanedStep = { ...step };
    // Clean conditional routing rules
    if (cleanedStep.conditionalRouting && Array.isArray(cleanedStep.conditionalRouting)) {
      cleanedStep.conditionalRouting = cleanedStep.conditionalRouting.map((rule: any) => {
        const { input_mapping_json, ...cleanRule } = rule; // Remove UI helper field
        return cleanRule;
      });
    }
    return cleanedStep;
  });
}

// Get step name for routing visualization
function getStepName(target: string | number): string {
  if (typeof target === 'number') {
    // This is a chain ID
    const chain = availableChains.value.find(c => c.id === target);
    return chain ? chain.name : `Chain #${target}`;
  } else {
    // This is a step ID
    const stepIndex = steps.value.findIndex(s => s.id === target);
    if (stepIndex !== -1) {
      const step = steps.value[stepIndex];
      return `Step ${stepIndex + 1}: ${step.name || step.id}`;
    }
    return target;
  }
}

// Apply a routing template
function applyRoutingTemplate(template: typeof routingTemplates[0]) {
  if (!selectedStep.value) return;
  if (!(selectedStep.value as any).conditionalRouting) {
    (selectedStep.value as any).conditionalRouting = [];
  }

  // Clone the template rule
  const newRule = JSON.parse(JSON.stringify(template.rule));
  newRule.id = `rule_${Date.now()}`;

  // Prepare input_mapping_json for UI
  if (newRule.input_mapping) {
    newRule.input_mapping_json = JSON.stringify(newRule.input_mapping, null, 2);
  } else {
    newRule.input_mapping_json = '{}';
  }

  (selectedStep.value as any).conditionalRouting.push(newRule);
  showTemplatesModal.value = false;
}

// Handle chain selection in routing rule - auto-populate input mapping
function onRoutingChainSelect(rule: any) {
  const chainId = rule.target;
  if (!chainId || chainId === 0) return;

  const targetChain = chainStore.chains.find(c => c.id === chainId);
  if (!targetChain) return;

  // Get expected input fields for the target chain
  const expectedFields = getChainInputFields(targetChain);

  if (expectedFields.length === 0) {
    // No input fields detected, set empty mapping
    rule.input_mapping = {};
    rule.input_mapping_json = '{}';
    return;
  }

  // Auto-populate input mapping with smart defaults
  const mapping: Record<string, string> = {};

  expectedFields.forEach(field => {
    // Create smart mappings based on field names
    if (field === 'userId' || field === 'user_id') {
      mapping[field] = '{{input.userId}}';
    } else if (field === 'characterName' || field === 'character_name') {
      mapping[field] = '{{input.characterName}}';
    } else if (field === 'message') {
      mapping[field] = '{{input.message}}';
    } else if (field === 'id') {
      mapping[field] = '{{input.id}}';
    } else if (selectedStepIndex.value !== null && selectedStepIndex.value > 0) {
      // Try to map from the current step's expected response
      const currentStepId = steps.value[selectedStepIndex.value]?.id;
      if (currentStepId) {
        mapping[field] = `{{${currentStepId}.${field}}}`;
      } else {
        mapping[field] = `{{input.${field}}}`;
      }
    } else {
      // Default: map from input
      mapping[field] = `{{input.${field}}}`;
    }
  });

  // Update the rule's input mapping
  rule.input_mapping = mapping;
  rule.input_mapping_json = JSON.stringify(mapping, null, 2);
}

// Test a routing rule with last execution data
function testRoutingRule(rule: any) {
  if (!testResult.value || !selectedStepIndex.value) {
    alert('Please run a test execution first to test routing rules');
    return;
  }

  // Build context from test result (mimicking execution engine context)
  const context: Record<string, any> = {
    input: lastTestInput.value || {},
    env: {},
  };

  // Add all previous step results to context
  testResult.value.steps.forEach((stepResult: any) => {
    context[stepResult.step_id] = stepResult.response;
  });

  // Evaluate the condition
  const conditionMet = evaluateCondition(rule.condition, context);

  // Store result on the rule for display
  rule.testResult = conditionMet;
}

// Evaluate a condition (matches backend execution-engine.ts logic)
function evaluateCondition(condition: any, context: Record<string, any>): boolean {
  if (!condition) return false;

  // Check if it's a logic group (AND/OR)
  if ('logic' in condition) {
    if (condition.logic === 'AND') {
      return condition.conditions.every((c: any) => evaluateCondition(c, context));
    } else {
      return condition.conditions.some((c: any) => evaluateCondition(c, context));
    }
  }

  // Single condition
  const value = getValueByPath(context, condition.field);
  return evaluateOperator(value, condition.operator, condition.value);
}

// Evaluate a comparison operator (matches backend logic)
function evaluateOperator(sourceValue: any, operator: string, targetValue: any): boolean {
  switch (operator) {
    case 'equals':
      return sourceValue === targetValue;
    case 'not_equals':
      return sourceValue !== targetValue;
    case 'contains':
      if (typeof sourceValue === 'string') {
        return sourceValue.includes(String(targetValue));
      }
      if (Array.isArray(sourceValue)) {
        return sourceValue.includes(targetValue);
      }
      return false;
    case 'not_contains':
      if (typeof sourceValue === 'string') {
        return !sourceValue.includes(String(targetValue));
      }
      if (Array.isArray(sourceValue)) {
        return !sourceValue.includes(targetValue);
      }
      return true;
    case 'greater_than':
      return Number(sourceValue) > Number(targetValue);
    case 'less_than':
      return Number(sourceValue) < Number(targetValue);
    case 'greater_or_equal':
      return Number(sourceValue) >= Number(targetValue);
    case 'less_or_equal':
      return Number(sourceValue) <= Number(targetValue);
    case 'exists':
      return sourceValue !== undefined && sourceValue !== null;
    case 'not_exists':
      return sourceValue === undefined || sourceValue === null;
    default:
      console.warn(`Unknown condition operator: ${operator}`);
      return false;
  }
}

// Get value from context by path (matches backend logic)
function getValueByPath(obj: any, path: string): any {
  if (!path) return undefined;

  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === undefined || current === null) {
      return undefined;
    }

    // Handle array indexing like "characters[0]"
    const arrayMatch = part.match(/^([^\[]+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, propName, indexStr] = arrayMatch;
      const index = parseInt(indexStr, 10);

      current = current[propName];
      if (current === undefined || current === null || !Array.isArray(current)) {
        return undefined;
      }
      current = current[index];
    } else {
      // Regular property access
      current = current[part];
    }
  }

  return current;
}

// Set step type (convert between module_call and chain_call)
function setStepType(type: 'module_call' | 'chain_call') {
  if (!selectedStep.value) return;

  if (type === 'chain_call') {
    // Convert to chain_call
    selectedStep.value.type = 'chain_call';
    (selectedStep.value as any).chain_id = 0;
    (selectedStep.value as any).input_mapping = {};
    // Remove module-specific fields
    delete (selectedStep.value as any).module;
    delete (selectedStep.value as any).endpoint;
    delete (selectedStep.value as any).method;
    delete (selectedStep.value as any).params;
    delete (selectedStep.value as any).body;
    delete (selectedStep.value as any).headers;
  } else {
    // Convert to module_call
    selectedStep.value.type = 'module_call';
    (selectedStep.value as any).module = 'intent';
    (selectedStep.value as any).endpoint = '';
    (selectedStep.value as any).method = 'POST';
    (selectedStep.value as any).params = {};
    (selectedStep.value as any).body = {};
    // Remove chain-specific fields
    delete (selectedStep.value as any).chain_id;
    delete (selectedStep.value as any).chain_name;
    delete (selectedStep.value as any).input_mapping;
  }
}

// Get input fields expected by a chain (by scanning its steps)
function getChainInputFields(chain: any): string[] {
  const fields = new Set<string>();

  const scanSteps = (steps: any[]) => {
    steps.forEach(step => {
      // Scan params
      if (step.params) {
        const paramsStr = JSON.stringify(step.params);
        const matches = paramsStr.match(/\{\{input\.(\w+)\}\}/g);
        if (matches) {
          matches.forEach(match => {
            const field = match.replace(/\{\{input\.|}\}/g, '');
            fields.add(field);
          });
        }
      }

      // Scan body
      if (step.body) {
        const bodyStr = JSON.stringify(step.body);
        const matches = bodyStr.match(/\{\{input\.(\w+)\}\}/g);
        if (matches) {
          matches.forEach(match => {
            const field = match.replace(/\{\{input\.|}\}/g, '');
            fields.add(field);
          });
        }
      }

      // Scan input_mapping for chain_call steps
      if (step.type === 'chain_call' && step.input_mapping) {
        const mappingStr = JSON.stringify(step.input_mapping);
        const matches = mappingStr.match(/\{\{input\.(\w+)\}\}/g);
        if (matches) {
          matches.forEach(match => {
            const field = match.replace(/\{\{input\.|}\}/g, '');
            fields.add(field);
          });
        }
      }

      // Recursively scan conditional branches
      if (step.type === 'conditional') {
        if (step.ifTrue) scanSteps(step.ifTrue);
        if (step.ifFalse) scanSteps(step.ifFalse);
      }
    });
  };

  if (chain.steps) {
    scanSteps(chain.steps);
  }

  return Array.from(fields).sort();
}

// Get input fields for a chain by ID (used in routing rules)
function getChainInputFieldsForRule(chainId: number): string[] {
  if (!chainId || chainId === 0) return [];
  const chain = chainStore.chains.find(c => c.id === chainId);
  if (!chain) return [];
  return getChainInputFields(chain);
}

// Handle chain selection
function onChainSelect() {
  if (!selectedStep.value || selectedStep.value.type !== 'chain_call') return;
  const chainId = (selectedStep.value as any).chain_id;
  const chain = chainStore.chains.find(c => c.id === chainId);
  if (chain) {
    (selectedStep.value as any).chain_name = chain.name;
  }
}

// Generate unique step ID
function generateStepId(): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `step_${timestamp}_${random}`;
}

// Add step to root level (always creates module_call, user can switch type in config)
function addStepToRoot() {
  const newStep: ChainStep = {
    type: 'module_call',
    id: generateStepId(),
    name: '',
    module: 'intent',
    endpoint: '',
    method: 'POST',
    params: {},
    body: {},
  };

  steps.value.push(newStep);
  selectStepByPath([steps.value.length - 1]);
}

// Insert a logic block at a specific position

// Select step by path
function selectStepByPath(path: any[]) {
  selectedStepPath.value = path;
  // Update legacy selectedStepIndex for backward compatibility
  if (path.length === 1) {
    selectedStepIndex.value = path[0];
  } else {
    selectedStepIndex.value = null;
  }
}

// Check if step at path is selected
function isStepSelected(path: any[]): boolean {
  if (!selectedStepPath.value) return false;
  return JSON.stringify(selectedStepPath.value) === JSON.stringify(path);
}


function selectStep(index: number) {
  selectStepByPath([index]);
}

function deleteStep(index: number) {
  if (confirm('Delete this step?')) {
    steps.value.splice(index, 1);
    if (selectedStepPath.value && selectedStepPath.value[0] === index) {
      selectedStepPath.value = null;
    }
  }
}

function moveStepUp(index: number) {
  if (index > 0) {
    [steps.value[index], steps.value[index - 1]] = [steps.value[index - 1], steps.value[index]];
    if (selectedStepIndex.value === index) {
      selectedStepIndex.value = index - 1;
    }
  }
}

function moveStepDown(index: number) {
  if (index < steps.value.length - 1) {
    [steps.value[index], steps.value[index + 1]] = [steps.value[index + 1], steps.value[index]];
    if (selectedStepIndex.value === index) {
      selectedStepIndex.value = index + 1;
    }
  }
}

function onModuleChange() {
  // Reset endpoint when module changes
  if (selectedStep.value) {
    selectedStep.value.endpoint = '';
    selectedStep.value.params = {};
    selectedStep.value.body = {};
  }
}

function onEndpointChange() {
  if (!selectedStep.value || !selectedEndpointMetadata.value) return;

  const endpoint = selectedEndpointMetadata.value;

  // Auto-set method
  selectedStep.value.method = endpoint.method;

  // Auto-populate params
  if (endpoint.params && endpoint.params.length > 0) {
    const params: Record<string, any> = {};
    endpoint.params.forEach(param => {
      // Create placeholder values
      if (param.name === 'userId') {
        params[param.name] = '{{input.userId}}';
      } else if (param.name === 'name' || param.name === 'characterName') {
        params[param.name] = '{{input.characterName}}';
      } else if (param.name === 'entityId') {
        params[param.name] = 'char_{{input.characterName}}';
      } else if (param.name === 'id') {
        params[param.name] = '{{input.id}}';
      } else if (param.type === 'number') {
        params[param.name] = 0;
      } else if (param.type === 'boolean') {
        params[param.name] = false;
      } else {
        params[param.name] = `{{input.${param.name}}}`;
      }
    });
    selectedStep.value.params = params;
  } else {
    selectedStep.value.params = {};
  }

  // Auto-populate body
  if (endpoint.body && endpoint.body.length > 0) {
    const body: Record<string, any> = {};
    endpoint.body.forEach(field => {
      // Create placeholder values
      if (field.name === 'message') {
        body[field.name] = '{{input.message}}';
      } else if (field.name === 'user_id' || field.name === 'userId') {
        body[field.name] = '{{input.userId}}';
      } else if (field.name === 'user_character' || field.name === 'characterName') {
        body[field.name] = '{{input.characterName}}';
      } else if (field.name === 'input') {
        body[field.name] = '{{input.message}}';
      } else if (field.type === 'number') {
        body[field.name] = 0;
      } else if (field.type === 'boolean') {
        body[field.name] = false;
      } else if (field.type === 'object') {
        body[field.name] = {};
      } else if (field.type === 'array') {
        body[field.name] = [];
      } else {
        body[field.name] = `{{input.${field.name}}}`;
      }
    });
    selectedStep.value.body = body;
  } else {
    selectedStep.value.body = {};
  }
}

async function saveChain() {
  try {
    // Use chainOwner for authorization (who can create/edit the chain)
    const owner = chainOwner.value || 'admin';

    // Store input values in meta_data for persistence
    const meta_data = {
      defaultInputValues: inputValues.value,
    };

    // Parse output template
    let parsedOutputTemplate: Record<string, any> | undefined = undefined;
    if (outputTemplateJson.value.trim() !== '{}' && outputTemplateJson.value.trim() !== '') {
      try {
        parsedOutputTemplate = JSON.parse(outputTemplateJson.value);
      } catch (e) {
        alert('Invalid JSON in Output Template');
        return;
      }
    }

    if (editMode.value && editingChainId.value) {
      await chainStore.updateChain(editingChainId.value, {
        name: chainName.value,
        description: description.value,
        steps: cleanStepsForSaving(steps.value),
        output_template: parsedOutputTemplate,
        meta_data,
      }, owner);
      alert('Chain updated successfully! You can continue editing or test your changes.');
    } else {
      const created = await chainStore.createChain({
        user_id: owner,
        name: chainName.value,
        description: description.value,
        steps: cleanStepsForSaving(steps.value),
        output_template: parsedOutputTemplate,
        meta_data,
      });
      alert('Chain saved successfully! You can continue editing or test your chain.');
      // Switch to edit mode after creating
      editMode.value = true;
      editingChainId.value = created.id!;
      router.replace(`/chains/${created.id}/edit`);
    }
  } catch (error: any) {
    alert(`Error: ${error.message}`);
  }
}

function testChain() {
  // Use the input values from the form
  testInput.value = JSON.stringify(inputValues.value, null, 2);
  testResult.value = null;
  showTestModal.value = true;
}

function formatFieldName(fieldName: string): string {
  // Convert camelCase to Title Case
  return fieldName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

function getInputVariableName(field: string): string {
  // Helper to generate {{input.field}} without Vue template parsing issues
  const open = '{{';
  const close = '}}';
  return `${open}input.${field}${close}`;
}

async function executeTest() {
  testLoading.value = true;
  try {
    const input = JSON.parse(testInput.value);
    const userId = inputValues.value.userId || 'admin';

    // Parse output template
    let parsedOutputTemplate: Record<string, any> | undefined = undefined;
    if (outputTemplateJson.value.trim() !== '{}' && outputTemplateJson.value.trim() !== '') {
      try {
        parsedOutputTemplate = JSON.parse(outputTemplateJson.value);
      } catch (e) {
        // If invalid JSON, just skip the output template
        console.warn('Invalid output template JSON, skipping');
      }
    }

    const result = await executionStore.executeAdHocChain(
      userId,
      chainName.value,
      steps.value,
      input,
      parsedOutputTemplate
    );
    testResult.value = result;
    lastTestInput.value = input;

    // Update endpoint cache with response structures
    if (result.success && result.steps) {
      result.steps.forEach((stepResult: any) => {
        updateEndpointCache(stepResult);
      });
    }
  } catch (error: any) {
    alert(`Error: ${error.message}`);
  } finally {
    testLoading.value = false;
  }
}

function closeTestModal() {
  showTestModal.value = false;
  // Don't clear testResult - keep it for variable reference
}

// Hierarchical variable structure for expandable UI
interface VariableNode {
  path: string;        // Full path like "step_1.result.intents"
  fullVariable: string; // Full variable syntax like "{{step_1.result.intents}}"
  label: string;       // Display label like "intents"
  value: any;          // Actual value
  valueDisplay: string; // Formatted display value
  hasChildren: boolean; // Whether this node has children
  children?: VariableNode[]; // Child nodes
  depth: number;       // Nesting depth for indentation
}

/**
 * Extract all available paths from an object for variable mapping
 */
function getAvailablePaths(obj: any, prefix: string, maxDepth: number = 3, currentDepth: number = 0): Array<{ full: string; value: any }> {
  const paths: Array<{ full: string; value: any }> = [];

  if (currentDepth >= maxDepth) return paths;

  if (obj === null || obj === undefined) return paths;

  if (typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [key, value] of Object.entries(obj)) {
      const path = `${prefix}.${key}`;

      // Add the current path
      if (typeof value !== 'object' || value === null) {
        paths.push({ full: `{{${path}}}`, value });
      } else if (Array.isArray(value)) {
        // For arrays, show the array itself and first item as example
        paths.push({ full: `{{${path}}}`, value: `[${value.length} items]` });
        if (value.length > 0 && typeof value[0] !== 'object') {
          paths.push({ full: `{{${path}[0]}}`, value: value[0] });
        }
      } else {
        // Recursively process nested objects
        const nestedPaths = getAvailablePaths(value, path, maxDepth, currentDepth + 1);
        paths.push(...nestedPaths);
      }
    }
  } else if (Array.isArray(obj) && obj.length > 0) {
    // Handle top-level arrays
    paths.push({ full: `{{${prefix}}}`, value: `[${obj.length} items]` });
    if (typeof obj[0] !== 'object') {
      paths.push({ full: `{{${prefix}[0]}}`, value: obj[0] });
    } else {
      const nestedPaths = getAvailablePaths(obj[0], `${prefix}[0]`, maxDepth, currentDepth + 1);
      paths.push(...nestedPaths);
    }
  }

  return paths;
}

/**
 * Generate expected/hint properties for empty objects based on their path
 * These hints show common properties that might be available at runtime
 */
function getExpectedPropertiesForPath(path: string): VariableNode[] {
  const hintNodes: VariableNode[] = [];

  // Intent metadata common properties
  if (path.match(/intent.*\.metadata/)) {
    const commonProps = [
      { key: 'target', desc: 'target entity or object' },
      { key: 'weapon', desc: 'weapon being used' },
      { key: 'item', desc: 'item being referenced' },
      { key: 'location', desc: 'location or destination' },
      { key: 'spell', desc: 'spell or ability name' },
      { key: 'npc', desc: 'NPC being interacted with' },
      { key: 'direction', desc: 'movement direction' },
      { key: 'quantity', desc: 'amount or count' }
    ];

    commonProps.forEach(({ key, desc }) => {
      hintNodes.push({
        path: `${path}.${key}`,
        fullVariable: `{{${path}.${key}}}`,
        label: `${key} *`,
        value: undefined,
        valueDisplay: `hint: ${desc}`,
        hasChildren: false,
        depth: 0 // Will be adjusted by caller
      });
    });
  }

  // Generic empty object hint
  if (hintNodes.length === 0) {
    hintNodes.push({
      path: `${path}.<key>`,
      fullVariable: '',
      label: '* Type manually: ' + `{{${path}.yourKey}}`,
      value: undefined,
      valueDisplay: '(no properties in test data)',
      hasChildren: false,
      depth: 0
    });
  }

  return hintNodes;
}

/**
 * Build hierarchical variable tree for expandable UI
 */
function buildVariableTree(obj: any, prefix: string, maxDepth: number = 5, currentDepth: number = 0): VariableNode[] {
  const nodes: VariableNode[] = [];

  if (currentDepth >= maxDepth || obj === null || obj === undefined) {
    return nodes;
  }

  if (typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const fullVariable = `{{${path}}}`;

      // Reflexive type detection: mark ALL objects as expandable, not just non-empty ones
      // This allows runtime access to object properties even if they're empty during analysis
      const isObjectType = typeof value === 'object' && value !== null;
      const hasChildren = isObjectType;

      // Build children for objects/arrays that have keys/elements
      let children: VariableNode[] | undefined = undefined;
      if (isObjectType) {
        if (Array.isArray(value)) {
          children = value.length > 0 ? buildVariableTree(value, path, maxDepth, currentDepth + 1) : [];
        } else {
          const actualChildren = Object.keys(value).length > 0
            ? buildVariableTree(value, path, maxDepth, currentDepth + 1)
            : [];

          // If object is empty, add expected/hint properties
          if (actualChildren.length === 0) {
            const hintProperties = getExpectedPropertiesForPath(path);
            hintProperties.forEach(hint => {
              hint.depth = currentDepth + 1; // Adjust depth
            });
            children = hintProperties;
          } else {
            children = actualChildren;
          }
        }
      }

      const node: VariableNode = {
        path,
        fullVariable,
        label: key,
        value,
        valueDisplay: formatValue(value),
        hasChildren,
        depth: currentDepth,
        children
      };

      nodes.push(node);
    }
  } else if (Array.isArray(obj) && obj.length > 0) {
    // For arrays, create nodes for array itself and items
    const arrayNode: VariableNode = {
      path: prefix,
      fullVariable: `{{${prefix}}}`,
      label: 'array',
      value: obj,
      valueDisplay: `[${obj.length} items]`,
      hasChildren: true,
      depth: currentDepth,
      children: []
    };

    // Add first few items
    const itemsToShow = Math.min(obj.length, 5);
    for (let i = 0; i < itemsToShow; i++) {
      const itemPath = `${prefix}[${i}]`;
      const itemValue = obj[i];
      const isObjectType = typeof itemValue === 'object' && itemValue !== null;
      const hasChildren = isObjectType;

      // Build children for objects/arrays
      let children: VariableNode[] | undefined = undefined;
      if (isObjectType) {
        if (Array.isArray(itemValue)) {
          children = itemValue.length > 0 ? buildVariableTree(itemValue, itemPath, maxDepth, currentDepth + 2) : [];
        } else {
          const actualChildren = Object.keys(itemValue).length > 0
            ? buildVariableTree(itemValue, itemPath, maxDepth, currentDepth + 2)
            : [];

          // If object is empty, add expected/hint properties
          if (actualChildren.length === 0) {
            const hintProperties = getExpectedPropertiesForPath(itemPath);
            hintProperties.forEach(hint => {
              hint.depth = currentDepth + 2; // Adjust depth
            });
            children = hintProperties;
          } else {
            children = actualChildren;
          }
        }
      }

      arrayNode.children!.push({
        path: itemPath,
        fullVariable: `{{${itemPath}}}`,
        label: `[${i}]`,
        value: itemValue,
        valueDisplay: formatValue(itemValue),
        hasChildren,
        depth: currentDepth + 1,
        children
      });
    }

    if (obj.length > itemsToShow) {
      arrayNode.children!.push({
        path: `${prefix}[...]`,
        fullVariable: '',
        label: `... ${obj.length - itemsToShow} more items`,
        value: null,
        valueDisplay: '',
        hasChildren: false,
        depth: currentDepth + 1
      });
    }

    nodes.push(arrayNode);
  }

  return nodes;
}

// Toggle expansion of a variable path
function togglePathExpansion(path: string) {
  if (expandedPaths.value.has(path)) {
    expandedPaths.value.delete(path);
  } else {
    expandedPaths.value.add(path);
  }
}

// Check if a path is expanded
function isPathExpanded(path: string): boolean {
  return expandedPaths.value.has(path);
}

/**
 * Format a value for display
 */
function formatValue(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') {
    return value.length > 50 ? `"${value.substring(0, 50)}..."` : `"${value}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? '[empty array]' : `[${value.length} items]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return keys.length === 0 ? '{empty object}' : `{${keys.length} keys}`;
  }
  return String(value);
}

/**
 * Insert a variable into the currently focused textarea
 */
function insertVariable(variablePath: string) {
  // Try to find the focused textarea
  const activeElement = document.activeElement as HTMLTextAreaElement;

  if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
    const start = activeElement.selectionStart || 0;
    const end = activeElement.selectionEnd || 0;
    const text = activeElement.value;
    const before = text.substring(0, start);
    const after = text.substring(end);

    // Insert the variable at cursor position
    activeElement.value = before + variablePath + after;

    // Trigger input event to update v-model
    activeElement.dispatchEvent(new Event('input', { bubbles: true }));

    // Set cursor position after inserted text
    const newPos = start + variablePath.length;
    activeElement.setSelectionRange(newPos, newPos);
    activeElement.focus();
  } else {
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(variablePath);
    alert(`Copied to clipboard: ${variablePath}`);
  }
}

/**
 * Insert a variable into the output template textarea
 */
function insertVariableIntoOutput(variablePath: string) {
  try {
    // Try to parse current output template
    const current = outputTemplateJson.value.trim() === '' ? '{}' : outputTemplateJson.value;
    const parsed = JSON.parse(current);

    // Extract a reasonable field name from the variable path
    const pathParts = variablePath.replace(/[{}]/g, '').split('.');
    const fieldName = pathParts[pathParts.length - 1].replace(/\[.*\]/, '');

    // Add the variable to the template
    parsed[fieldName] = variablePath;

    // Update the JSON
    outputTemplateJson.value = JSON.stringify(parsed, null, 2);
  } catch (e) {
    // If parsing fails, just copy to clipboard
    navigator.clipboard.writeText(variablePath);
    alert(`Copied to clipboard: ${variablePath}`);
  }
}

/**
 * Insert a variable into the routing input mapping textarea
 */
function insertVariableIntoRoutingMapping(variablePath: string, textareaId: string, rule: any) {
  try {
    // Try to parse current input mapping
    const current = rule.input_mapping_json?.trim() === '' ? '{}' : (rule.input_mapping_json || '{}');
    const parsed = JSON.parse(current);

    // Extract a reasonable field name from the variable path
    const pathParts = variablePath.replace(/[{}]/g, '').split('.');
    const fieldName = pathParts[pathParts.length - 1].replace(/\[.*\]/, '');

    // Add the variable to the mapping
    parsed[fieldName] = variablePath;

    // Update the JSON
    rule.input_mapping_json = JSON.stringify(parsed, null, 2);

    // Also update the actual input_mapping object
    updateRoutingInputMapping(rule);
  } catch (e) {
    // If parsing fails, just copy to clipboard
    navigator.clipboard.writeText(variablePath);
    alert(`Copied to clipboard: ${variablePath}`);
  }
}

// Open JSON Editor Modal
function openJsonEditor(title: string, initialContent: string, callback: (value: string) => void) {
  jsonEditorTitle.value = title;
  jsonEditorContent.value = initialContent;
  jsonEditorCallback.value = callback;
  jsonEditorCursorPosition.value = initialContent.length;
  showJsonEditorModal.value = true;

  // Auto-expand first level nodes
  expandedPaths.value.clear();
  const categories = getAvailableVariablesForEditor();
  categories.forEach(category => {
    category.nodes.forEach(node => {
      if (node.hasChildren && node.depth === 0) {
        expandedPaths.value.add(node.path);
      }
    });
  });

  // Focus textarea after modal opens
  setTimeout(() => {
    const textarea = document.getElementById('json-editor-textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
      // Move cursor to end
      textarea.setSelectionRange(initialContent.length, initialContent.length);
    }
  }, 100);
}

// Wrapper functions for opening specific editors
function openParamsEditor() {
  const step = selectedStep.value;
  if (!step) return;

  openJsonEditor('Edit Parameters', paramsJson.value, (value: string) => {
    try {
      const parsed = JSON.parse(value);
      step.params = parsed;
    } catch (e: any) {
      console.error('Invalid JSON for params:', e);

      // Check if it's a template variable syntax error
      if (value.match(/:\s*\{\{[^}]+\}\}/)) {
        alert(`Invalid JSON: Template variables for arrays/objects must be quoted.

Example - WRONG:
"data": {{step_1.result}}

Example - CORRECT:
"data": "{{step_1.result}}"

The backend will automatically convert the string to the actual value at runtime.

Error: ${e.message}`);
      } else {
        alert('Invalid JSON: ' + e.message);
      }
    }
  });
}

function openBodyEditor() {
  const step = selectedStep.value;
  if (!step) return;

  openJsonEditor('Edit Request Body', bodyJson.value, (value: string) => {
    try {
      const parsed = JSON.parse(value);
      step.body = parsed;
    } catch (e: any) {
      console.error('Invalid JSON for body:', e);

      // Check if it's a template variable syntax error
      if (value.match(/:\s*\{\{[^}]+\}\}/)) {
        alert(`Invalid JSON: Template variables for arrays/objects must be quoted.

Example - WRONG:
"intents": {{step_1.result.intents}}

Example - CORRECT:
"intents": "{{step_1.result.intents}}"

The backend will automatically convert the string to the actual array/object at runtime.

Error: ${e.message}`);
      } else {
        alert('Invalid JSON: ' + e.message);
      }
    }
  });
}

function openChainInputMappingEditor() {
  const step = selectedStep.value;
  if (!step || step.type !== 'chain_call') return;

  openJsonEditor('Edit Chain Input Mapping', chainInputMappingJson.value, (value: string) => {
    try {
      (step as any).input_mapping = JSON.parse(value);
    } catch (e: any) {
      console.error('Invalid JSON for input mapping:', e);

      // Check if it's a template variable syntax error
      if (value.match(/:\s*\{\{[^}]+\}\}/)) {
        alert(`Invalid JSON: Template variables for arrays/objects must be quoted.

Example - WRONG:
"data": {{step_1.result}}

Example - CORRECT:
"data": "{{step_1.result}}"

The backend will automatically convert the string to the actual value at runtime.

Error: ${e.message}`);
      } else {
        alert('Invalid JSON: ' + e.message);
      }
    }
  });
}

function openOutputTemplateEditor() {
  openJsonEditor('Edit Output Template', outputTemplateJson.value, (value: string) => {
    try {
      const parsed = JSON.parse(value);
      outputTemplate.value = parsed;
      outputTemplateJson.value = value;
    } catch (e: any) {
      console.error('Invalid JSON for output template:', e);

      // Check if it's a template variable syntax error
      if (value.match(/:\s*\{\{[^}]+\}\}/)) {
        alert(`Invalid JSON: Template variables for arrays/objects must be quoted.

Example - WRONG:
"characters": {{step_1.result}}

Example - CORRECT:
"characters": "{{step_1.result}}"

The backend will automatically convert the string to the actual value at runtime.

Error: ${e.message}`);
      } else {
        alert('Invalid JSON: ' + e.message);
      }
    }
  });
}

// Close JSON Editor Modal
function closeJsonEditor() {
  showJsonEditorModal.value = false;
  jsonEditorContent.value = '{}';
  jsonEditorCallback.value = null;
}

// Save JSON Editor content
function saveJsonEditor() {
  if (jsonEditorCallback.value) {
    jsonEditorCallback.value(jsonEditorContent.value);
  }
  closeJsonEditor();
}

// Insert variable into JSON editor at cursor position
function insertVariableIntoJsonEditor(variablePath: string) {
  const textarea = document.getElementById('json-editor-textarea') as HTMLTextAreaElement;
  if (!textarea) return;

  const start = textarea.selectionStart || 0;
  const end = textarea.selectionEnd || 0;
  const text = jsonEditorContent.value;
  const before = text.substring(0, start);
  const after = text.substring(end);

  // Insert the variable at cursor position
  jsonEditorContent.value = before + variablePath + after;

  // Set cursor position after inserted text
  setTimeout(() => {
    const newPos = start + variablePath.length;
    textarea.setSelectionRange(newPos, newPos);
    textarea.focus();
  }, 0);
}

// Handle keyboard shortcuts in JSON editor
function handleJsonEditorKeydown(event: KeyboardEvent) {
  // Ctrl+S or Cmd+S: Save
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault();
    saveJsonEditor();
    return;
  }

  // Escape: Close
  if (event.key === 'Escape') {
    event.preventDefault();
    closeJsonEditor();
    return;
  }

  // Tab: Insert 2 spaces instead of default tab behavior
  if (event.key === 'Tab') {
    event.preventDefault();
    const textarea = event.target as HTMLTextAreaElement;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = jsonEditorContent.value;

    if (event.shiftKey) {
      // Shift+Tab: Decrease indent (remove 2 spaces at start of line)
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const lineText = text.substring(lineStart, start);
      if (lineText.startsWith('  ')) {
        jsonEditorContent.value = text.substring(0, lineStart) + text.substring(lineStart + 2);
        setTimeout(() => {
          textarea.setSelectionRange(start - 2, end - 2);
        }, 0);
      }
    } else {
      // Tab: Insert 2 spaces
      jsonEditorContent.value = text.substring(0, start) + '  ' + text.substring(end);
      setTimeout(() => {
        textarea.setSelectionRange(start + 2, start + 2);
      }, 0);
    }
    return;
  }

  // Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z are handled natively by the browser
  // We don't need to prevent default for these - they work automatically
}

// Get available variables for JSON editor based on current step
function getAvailableVariablesForEditor(): Array<{ category: string; nodes: VariableNode[] }> {
  const categories: Array<{ category: string; nodes: VariableNode[] }> = [];

  // Input variables
  if (lastTestInput.value) {
    const nodes = buildVariableTree(lastTestInput.value, 'input');
    if (nodes.length > 0) {
      categories.push({
        category: 'Input Data',
        nodes
      });
    }
  }

  // Previous steps with hierarchical structure
  if (testResult.value && selectedStepIndex.value !== null && selectedStepIndex.value > 0) {
    testResult.value.steps.slice(0, selectedStepIndex.value).forEach((stepResult: any, index: number) => {
      if (stepResult.response) {
        const nodes = buildVariableTree(stepResult.response, stepResult.step_id);
        if (nodes.length > 0) {
          categories.push({
            category: `Step ${index + 1}: ${stepResult.step_name || stepResult.step_id}`,
            nodes
          });
        }
      }
    });
  }

  // Use cached structures when no test data is available
  if (!testResult.value && selectedStepIndex.value !== null && selectedStepIndex.value > 0) {
    steps.value.slice(0, selectedStepIndex.value).forEach((step, index) => {
      const cachedStructure = getCachedStructure(step);

      if (cachedStructure && cachedStructure.exampleResponse) {
        // Build tree from cached response
        const nodes = buildVariableTree(cachedStructure.exampleResponse, step.id);
        if (nodes.length > 0) {
          categories.push({
            category: `Step ${index + 1}: ${step.name || step.id} (cached)`,
            nodes
          });
        }
      } else if (cachedStructure && cachedStructure.fields.length > 0) {
        // Fallback: create flat list from field paths
        const nodes: VariableNode[] = cachedStructure.fields.map(field => ({
          path: `${step.id}.${field}`,
          fullVariable: `{{${step.id}.${field}}}`,
          label: field,
          value: '(cached)',
          valueDisplay: '(cached)',
          hasChildren: false,
          depth: 0
        }));

        categories.push({
          category: `Step ${index + 1}: ${step.name || step.id} (cached)`,
          nodes
        });
      } else {
        // Fallback to generic fields if no cache available
        const nodes: VariableNode[] = [
          {
            path: `${step.id}.response`,
            fullVariable: `{{${step.id}.response}}`,
            label: 'response',
            value: '(no data)',
            valueDisplay: '(no data)',
            hasChildren: false,
            depth: 0
          },
          {
            path: `${step.id}.success`,
            fullVariable: `{{${step.id}.success}}`,
            label: 'success',
            value: '(no data)',
            valueDisplay: '(no data)',
            hasChildren: false,
            depth: 0
          }
        ];

        categories.push({
          category: `Step ${index + 1}: ${step.name || step.id}`,
          nodes
        });
      }
    });
  }

  return categories;
}

// Watch for new input fields and add default values
watchEffect(() => {
  detectedInputFields.value.forEach(field => {
    if (!(field in inputValues.value)) {
      // Add smart defaults for common fields
      if (field === 'userId') {
        inputValues.value[field] = 'admin';
      } else if (field === 'characterName') {
        inputValues.value[field] = 'Thorin';
      } else if (field === 'message') {
        inputValues.value[field] = 'I attack the goblin';
      } else if (field === 'id' || field.endsWith('Id')) {
        inputValues.value[field] = '1';
      } else if (field === 'x' || field === 'y') {
        inputValues.value[field] = '0';
      } else if (field === 'radius') {
        inputValues.value[field] = '50';
      } else if (field === 'type') {
        inputValues.value[field] = 'location';
      } else {
        inputValues.value[field] = '';
      }
    }
  });
});

onMounted(async () => {
  // Load endpoint cache from localStorage
  loadEndpointCache();

  // Load module metadata for dropdowns
  try {
    await moduleStore.loadModules();
  } catch (error: any) {
    console.error('Failed to load modules:', error);
  }

  // Load all chains for chain_call step type
  try {
    await chainStore.loadAllChains();
  } catch (error: any) {
    console.error('Failed to load chains:', error);
  }

  const id = route.params.id;
  if (id) {
    // Edit mode
    editMode.value = true;
    editingChainId.value = parseInt(id as string);
    try {
      const chain = await chainStore.loadChain(editingChainId.value);
      chainName.value = chain.name;
      description.value = chain.description || '';
      steps.value = processLoadedSteps(chain.steps);

      // Set the chain owner (for authorization)
      if (chain.user_id) {
        chainOwner.value = chain.user_id;
      }

      // Load saved input values from meta_data
      if (chain.meta_data && chain.meta_data.defaultInputValues) {
        inputValues.value = { ...inputValues.value, ...chain.meta_data.defaultInputValues };
      }

      // Load output template
      if (chain.output_template) {
        outputTemplate.value = chain.output_template;
        outputTemplateJson.value = JSON.stringify(chain.output_template, null, 2);
      }
    } catch (error: any) {
      alert(`Error loading chain: ${error.message}`);
      router.push('/builder');
    }
  }
});
</script>
