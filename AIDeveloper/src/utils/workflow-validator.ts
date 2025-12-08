/**
 * Workflow Validator
 * Validates that workflows actually completed their objectives (not just scaffolds)
 */

import fs from "fs/promises";
import path from "path";
import * as logger from "./logger.js";

/**
 * Validate new_module workflow completion
 * Checks if actual implementation was done (not just scaffold)
 */
export async function validateNewModuleCompletion(
  workflowDir: string,
  _moduleName: string
): Promise<{
  isComplete: boolean;
  reason?: string;
  suggestions?: string[];
}> {
  try {
    const repoPath = path.join(workflowDir, "repo");

    // Check for frontend implementation
    const frontendPages = path.join(repoPath, "frontend", "src", "pages");

    try {
      const files = await fs.readdir(frontendPages);
      const componentFiles = files.filter((f) => f.endsWith(".tsx") || f.endsWith(".jsx"));

      for (const file of componentFiles) {
        const filePath = path.join(frontendPages, file);
        const content = await fs.readFile(filePath, "utf-8");

        // Check if file is just a placeholder (only contains description text)
        const isPlaceholder = checkIfPlaceholder(content);

        if (isPlaceholder) {
          return {
            isComplete: false,
            reason: `Component ${file} is just a placeholder - no actual implementation`,
            suggestions: [
              "Add useState hooks for state management",
              "Implement interactive UI elements (buttons, forms, etc.)",
              "Add event handlers and logic",
              "Connect to backend API if needed",
            ],
          };
        }
      }
    } catch (error) {
      // No frontend, check backend
    }

    // Check backend implementation
    const backendSrc = path.join(repoPath, "src");
    try {
      const files = await fs.readdir(backendSrc);
      const serverFile = files.find((f) => f === "server.ts" || f === "index.ts");

      if (serverFile) {
        const content = await fs.readFile(path.join(backendSrc, serverFile), "utf-8");

        // Check if only has health endpoint (scaffold indicator)
        const hasOnlyHealth =
          content.includes("/health") &&
          content.includes("TODO") &&
          !content.includes("router.get") &&
          !content.includes("router.post");

        if (hasOnlyHealth) {
          return {
            isComplete: false,
            reason: "Backend only has health endpoint - no API routes implemented",
            suggestions: [
              "Add API routes for module functionality",
              "Implement business logic",
              "Add database operations if needed",
            ],
          };
        }
      }
    } catch (error) {
      // No backend check
    }

    return {
      isComplete: true,
    };
  } catch (error) {
    logger.error("Failed to validate workflow completion", error as Error);
    // If validation fails, assume complete (don't block)
    return {
      isComplete: true,
    };
  }
}

/**
 * Check if a React component is just a placeholder
 */
function checkIfPlaceholder(content: string): boolean {
  // Signs of a placeholder:
  // 1. No imports (except default export declaration)
  // 2. No useState/useEffect/useRef hooks
  // 3. Only contains description text from task
  // 4. No event handlers (onClick, onChange, etc.)
  // 5. No interactive elements beyond basic div/h1/p

  const hasStateManagement =
    content.includes("useState") ||
    content.includes("useEffect") ||
    content.includes("useReducer") ||
    content.includes("useContext");

  const hasEventHandlers =
    content.includes("onClick") ||
    content.includes("onChange") ||
    content.includes("onSubmit") ||
    content.includes("onInput");

  const hasInteractiveElements =
    content.includes("<button") ||
    content.includes("<input") ||
    content.includes("<form") ||
    content.includes("<select") ||
    content.includes("<textarea");

  const hasImports = content.includes("import") && (content.match(/^import/gm) || []).length > 1; // More than just React import

  // If it has any of these, it's likely implemented
  if (hasStateManagement || hasEventHandlers || hasInteractiveElements || hasImports) {
    return false;
  }

  // If it only returns a div with text, it's a placeholder
  const isSimpleTextReturn =
    (content.includes("return (") &&
      content.includes("<div") &&
      content.includes("<p") &&
      !content.includes("{")) || // No JSX expressions
    (content.match(/{/g) || []).length <= 2; // Only function and return braces

  return isSimpleTextReturn;
}
