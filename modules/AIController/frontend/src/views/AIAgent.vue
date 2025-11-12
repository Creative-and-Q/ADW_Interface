<template>
  <div class="h-screen flex flex-col bg-gray-50">
    <!-- Header -->
    <div class="bg-white border-b border-gray-200 px-6 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">🤖 AI Chain Agent</h1>
          <p class="text-sm text-gray-600 mt-1">
            Ask me to create, modify, or analyze chains using natural language
          </p>
        </div>
        <button
          v-if="messages.length > 0"
          @click="clearChat"
          class="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          Clear Chat
        </button>
      </div>
    </div>

    <!-- Chat Messages -->
    <div class="flex-1 overflow-y-auto px-6 py-4 space-y-4">
      <!-- Welcome Message -->
      <div v-if="messages.length === 0" class="max-w-3xl mx-auto mt-12">
        <div class="text-center mb-8">
          <div class="inline-block p-4 bg-blue-100 rounded-full mb-4">
            <span class="text-4xl">🤖</span>
          </div>
          <h2 class="text-2xl font-bold text-gray-900 mb-2">How can I help you today?</h2>
          <p class="text-gray-600">I can help you build and manage AI chains through conversation</p>
        </div>

        <!-- Quick Actions -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            @click="sendQuickPrompt('Show me all existing chains')"
            class="p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
          >
            <div class="font-medium text-gray-900 mb-1">📋 List Chains</div>
            <div class="text-sm text-gray-600">Show me all existing chains</div>
          </button>

          <button
            @click="sendQuickPrompt('Create a chain that interprets player intent and gets their character')"
            class="p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
          >
            <div class="font-medium text-gray-900 mb-1">✨ Create Intent Chain</div>
            <div class="text-sm text-gray-600">Build a basic intent + character chain</div>
          </button>

          <button
            @click="sendQuickPrompt('Create a router that sends attack intents to chain 5')"
            class="p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
          >
            <div class="font-medium text-gray-900 mb-1">🔀 Create Router</div>
            <div class="text-sm text-gray-600">Route different intents to chains</div>
          </button>

          <button
            @click="sendQuickPrompt('Analyze chain 1 and suggest improvements')"
            class="p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
          >
            <div class="font-medium text-gray-900 mb-1">🔍 Analyze Chain</div>
            <div class="text-sm text-gray-600">Get AI suggestions for improvements</div>
          </button>
        </div>
      </div>

      <!-- Messages -->
      <div
        v-for="(message, index) in messages"
        :key="index"
        class="max-w-3xl mx-auto"
      >
        <!-- User Message -->
        <div v-if="message.role === 'user'" class="flex justify-end mb-4">
          <div class="bg-blue-600 text-white rounded-lg px-4 py-3 max-w-xl">
            <div class="whitespace-pre-wrap">{{ message.content }}</div>
          </div>
        </div>

        <!-- Assistant Message -->
        <div v-else-if="message.role === 'assistant'" class="flex justify-start mb-4">
          <div class="bg-white border border-gray-200 rounded-lg px-4 py-3 max-w-xl">
            <div class="flex items-start space-x-3">
              <span class="text-2xl flex-shrink-0">🤖</span>
              <div class="flex-1">
                <div class="prose prose-sm max-w-none" v-html="formatMarkdown(message.content)"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading Indicator -->
      <div v-if="isLoading" class="max-w-3xl mx-auto">
        <div class="flex justify-start">
          <div class="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <div class="flex items-center space-x-3">
              <span class="text-2xl">🤖</span>
              <div class="flex space-x-2">
                <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
                <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
                <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Scroll anchor -->
      <div ref="scrollAnchor"></div>
    </div>

    <!-- Input Area -->
    <div class="bg-white border-t border-gray-200 px-6 py-4">
      <div class="max-w-3xl mx-auto">
        <div class="flex space-x-3">
          <textarea
            v-model="input"
            @keydown.enter.exact.prevent="sendMessage"
            @keydown.enter.shift.exact="input += '\n'"
            placeholder="Ask me to create a chain, modify an existing one, or analyze your workflows..."
            class="flex-1 resize-none rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows="1"
            :disabled="isLoading"
          ></textarea>
          <button
            @click="sendMessage"
            :disabled="!input.trim() || isLoading"
            class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
          >
            Send
          </button>
        </div>
        <div class="text-xs text-gray-500 mt-2">
          Press <kbd class="px-1 py-0.5 bg-gray-100 rounded">Enter</kbd> to send, <kbd class="px-1 py-0.5 bg-gray-100 rounded">Shift+Enter</kbd> for new line
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import axios from 'axios';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const messages = ref<Message[]>([]);
const input = ref('');
const isLoading = ref(false);
const scrollAnchor = ref<HTMLElement | null>(null);

// Use the same API base as other services (proxied through Vite)
const API_BASE = '/api';

/**
 * Format markdown-style text to HTML
 */
function formatMarkdown(text: string): string {
  let html = text;

  // Code blocks
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-gray-100 p-3 rounded overflow-x-auto my-2"><code>$2</code></pre>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm">$1</code>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 hover:underline" target="_blank">$1</a>');

  // Line breaks
  html = html.replace(/\n/g, '<br>');

  return html;
}

/**
 * Send a message to the AI agent
 */
async function sendMessage() {
  if (!input.value.trim() || isLoading.value) return;

  const userMessage: Message = {
    role: 'user',
    content: input.value.trim()
  };

  messages.value.push(userMessage);
  input.value = '';
  isLoading.value = true;

  try {
    // Scroll to bottom
    await nextTick();
    scrollAnchor.value?.scrollIntoView({ behavior: 'smooth' });

    // Send to AI agent
    const response = await axios.post(`${API_BASE}/ai/chat`, {
      messages: messages.value
    });

    if (response.data.success) {
      const assistantMessage: Message = {
        role: 'assistant',
        content: response.data.data.content
      };
      messages.value.push(assistantMessage);
    } else {
      throw new Error(response.data.error || 'Unknown error');
    }
  } catch (error: any) {
    console.error('AI chat error:', error);
    const errorMessage: Message = {
      role: 'assistant',
      content: `Sorry, I encountered an error: ${error.response?.data?.error || error.message}`
    };
    messages.value.push(errorMessage);
  } finally {
    isLoading.value = false;

    // Scroll to bottom
    await nextTick();
    scrollAnchor.value?.scrollIntoView({ behavior: 'smooth' });
  }
}

/**
 * Send a quick prompt
 */
function sendQuickPrompt(prompt: string) {
  input.value = prompt;
  sendMessage();
}

/**
 * Clear chat history
 */
function clearChat() {
  if (confirm('Clear chat history?')) {
    messages.value = [];
  }
}
</script>

<style scoped>
textarea {
  min-height: 50px;
  max-height: 200px;
}

kbd {
  font-family: monospace;
  font-size: 0.875em;
  border: 1px solid #d1d5db;
}

.prose {
  color: #374151;
}

.prose code {
  font-family: 'Monaco', 'Courier New', monospace;
}

.prose pre {
  font-family: 'Monaco', 'Courier New', monospace;
}
</style>
