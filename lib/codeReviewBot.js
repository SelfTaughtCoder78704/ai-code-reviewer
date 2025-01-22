import OpenAI from 'openai';
import simpleGit from 'simple-git';
import fs from 'fs/promises';
import { join } from 'path';
import { createInterface } from 'readline';

// Utility functions
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isBuiltinModule(pkg) {
  try {
    return require('module').builtinModules.includes(pkg);
  } catch {
    const builtins = ['crypto', 'fs', 'path', 'http', 'https', 'util', 'os', 'stream'];
    return builtins.includes(pkg);
  }
}

async function askForConfirmation(question) {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    readline.question(question, answer => {
      readline.close();
      resolve(answer.toLowerCase() !== 'n');
    });
  });
}

export class CodeReviewBot {
  constructor(OPENAI_API_KEY, projectDir, model = 'gpt-4-0125-preview') {
    this.openai = new OpenAI({
      apiKey: OPENAI_API_KEY
    });
    this.model = model;
    this.projectDir = projectDir;
    this.git = simpleGit(projectDir);
  }

  createReviewPrompt(diffContent) {
    return `As a code reviewer, analyze the following code changes and provide:
      1. A summary of the changes
      2. Code improvements with specific suggestions
      3. Important issues that need addressing
      
      For any code that needs improvement, provide:
      - The exact code snippet that needs changing
      - The improved version of the code
      - A brief explanation of why the change helps

      Focus only on significant improvements that matter for:
      - Code correctness
      - Performance
      - Security
      - Maintainability

      Skip minor style issues or subjective preferences.
      
      Here are the code changes (in diff format):
      
      ${diffContent}

      Please format your response as JSON with the following structure:
      {
          "summary": "Brief description of changes",
          "modifications": [
              {
                  "file": "filename",
                  "original": "original code snippet",
                  "suggested": "improved code",
                  "explanation": "why this improvement helps",
                  "priority": "high|medium"
              }
          ],
          "issues": [
              {
                  "description": "issue description",
                  "severity": "high|medium",
                  "recommendation": "how to fix"
              }
          ],
          "testing": ["key test scenarios"]
      }`;
  }

  async generateReview(diffContent) {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are an experienced code reviewer focusing on code quality, security, and best practices. Provide responses in valid JSON format without markdown formatting."
          },
          {
            role: "user",
            content: this.createReviewPrompt(diffContent)
          }
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: "json_object" }
      });

      const content = response.choices[0].message.content;
      return JSON.parse(content);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON response from OpenAI: ${error.message}`);
      }
      throw new Error(`Failed to generate review: ${error.message}`);
    }
  }

  formatReviewOutput(review) {
    let output = `# Code Review Summary\n\n${review.summary}\n\n`;

    if (review.modifications && review.modifications.length > 0) {
      output += '# Suggested Code Modifications\n\n';
      review.modifications.forEach(mod => {
        output += `## ${mod.file} (${mod.priority})\n\n`;
        output += '```javascript\n// Current Code:\n';
        output += `${mod.original}\n\n`;
        output += '// Suggested Improvement:\n';
        output += `${mod.suggested}\n`;
        output += '```\n\n';
        output += `**Why:** ${mod.explanation}\n\n`;
      });
    }

    if (review.issues && review.issues.length > 0) {
      output += '# Issues to Address\n\n';
      review.issues.forEach(issue => {
        output += `## ${issue.severity.toUpperCase()} Priority\n`;
        output += `**Issue:** ${issue.description}\n`;
        output += `**Recommendation:** ${issue.recommendation}\n\n`;
      });
    }

    if (review.testing && review.testing.length > 0) {
      output += '# Testing Recommendations\n\n';
      review.testing.forEach(test => {
        output += `- ${test}\n`;
      });
    }

    return output;
  }

  async saveReview(review, outputPath) {
    try {
      await fs.writeFile(outputPath, this.formatReviewOutput(review), 'utf8');
      console.log(`Review saved to ${outputPath}`);
    } catch (error) {
      throw new Error(`Failed to save review: ${error.message}`);
    }
  }

  async getDiffContent(branch = 'main') {
    try {
      // Get both staged and unstaged changes
      const stagedDiff = await this.git.diff(['--cached']);
      const unstagedDiff = await this.git.diff();

      // Combine both diffs
      const fullDiff = stagedDiff + unstagedDiff;

      if (!fullDiff.trim()) {
        // If no staged/unstaged changes, check for uncommitted changes against the branch
        const branchDiff = await this.git.diff([branch]);
        if (!branchDiff.trim()) {
          return null;
        }
        return branchDiff;
      }

      const lines = fullDiff.split('\n');
      let filteredLines = [];
      let isInFile = false;
      let currentFile = '';

      for (const line of lines) {
        // New file diff starts
        if (line.startsWith('diff --git')) {
          isInFile = true;
          currentFile = line.split(' b/')[1];
          filteredLines.push(line);
          continue;
        }

        // File metadata lines
        if (line.startsWith('index ') ||
          line.startsWith('--- ') ||
          line.startsWith('+++ ')) {
          if (isInFile) {
            filteredLines.push(line);
          }
          continue;
        }

        // Hunk header
        if (line.startsWith('@@')) {
          if (isInFile) {
            filteredLines.push(line);
          }
          continue;
        }

        // Content lines
        if (isInFile) {
          // Include context lines and changes
          if (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-')) {
            filteredLines.push(line);
          }
        }
      }

      console.log('\nDetected changes:');
      filteredLines.forEach(line => {
        if (line.startsWith('diff --git')) {
          console.log(`\nFile: ${line.split(' b/')[1]}`);
        } else if (line.startsWith('+')) {
          console.log(`Added: ${line.substring(1)}`);
        } else if (line.startsWith('-')) {
          console.log(`Removed: ${line.substring(1)}`);
        }
      });

      return filteredLines.join('\n');
    } catch (error) {
      throw new Error(`Failed to get diff: ${error.message}`);
    }
  }

  async getFileContent(filePath) {
    try {
      const absolutePath = join(this.projectDir, filePath);
      return await fs.readFile(absolutePath, 'utf8');
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  async applyModifications(review, backupSuffix = '.backup') {
    for (const mod of review.modifications) {
      try {
        console.log(`\nProcessing modification for ${mod.file}:`);

        const filePath = join(this.projectDir, mod.file);
        const content = await this.getFileContent(mod.file);

        // Normalize strings and handle line endings
        const normalizedContent = content.replace(/\r\n/g, '\n');
        const normalizedOriginal = mod.original.replace(/\r\n/g, '\n')
          .trim()
          .replace(/^\+/, ''); // Remove leading + from git diff
        const normalizedSuggested = (mod.suggested || '').replace(/\r\n/g, '\n').trim();

        // Create backup before making changes
        await fs.writeFile(`${filePath}${backupSuffix}`, content);
        console.log(`Backup created at: ${filePath}${backupSuffix}`);

        // Apply the modification
        let newContent = normalizedContent;

        if (!normalizedSuggested) {
          // If suggestion is empty, remove the entire line containing the original content
          newContent = normalizedContent
            .split('\n')
            .map(line => {
              // If line contains our target text, check if it's part of a larger line
              if (line.includes(normalizedOriginal)) {
                // Remove only the target text and any trailing content
                const index = line.indexOf(normalizedOriginal);
                const beforeText = line.substring(0, index).trimEnd();
                // If there's content before our target, keep it
                return beforeText || null;
              }
              return line;
            })
            .filter(line => line !== null)
            .join('\n');
        } else {
          // For non-empty suggestions, use regex replacement
          const regex = new RegExp(escapeRegExp(normalizedOriginal) + '.*$', 'gm');
          newContent = normalizedContent.replace(regex, normalizedSuggested);
        }

        // Verify changes were made
        if (newContent === normalizedContent) {
          console.warn('Warning: No changes were made to the content');
          console.log('Original content:', normalizedOriginal);
          console.log('Line containing content:', normalizedContent.split('\n')
            .find(line => line.includes(normalizedOriginal)));
          continue;
        }

        // Write the new content
        await fs.writeFile(filePath, newContent);

        // Verify the changes
        const verifyContent = await this.getFileContent(mod.file);
        if (verifyContent === content) {
          console.error('Error: File content remained unchanged after writing');
        } else {
          console.log(`Successfully modified ${mod.file}`);
          console.log('Changes made:');
          console.log('- Original line:', normalizedOriginal);
          if (normalizedSuggested) {
            console.log('- New line:', normalizedSuggested);
          } else {
            console.log('- Line removed');
          }
        }

      } catch (error) {
        console.error(`Failed to modify ${mod.file}:`, error);
      }
    }
  }
}

// Export both the class and a default instance
export default CodeReviewBot; 