#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { join, resolve } from 'path';
import { cwd } from 'process';
import { createInterface } from 'readline';
import { CodeReviewBot } from '../lib/codeReviewBot.js';
import fs from 'fs/promises';

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

async function main() {
  try {
    // Get API key from environment
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable not set');
    }

    // Get current working directory
    const projectDir = cwd();

    // Parse command line arguments
    const args = process.argv.slice(2);
    const branch = args.find(arg => arg.startsWith('--branch='))?.split('=')[1] || 'main';
    const output = args.find(arg => arg.startsWith('--output='))?.split('=')[1] || 'review.md';
    const applyChanges = args.includes('--apply');
    const generateDocs = args.includes('--generate-docs');

    // Convert output path to absolute path if relative
    const outputPath = resolve(projectDir, output);

    // Initialize the review bot with the project directory
    const reviewer = new CodeReviewBot(apiKey, projectDir);

    // Get the diff content
    const diffContent = await reviewer.getDiffContent(branch);
    if (!diffContent) {
      throw new Error('No changes found to review');
    }

    // Generate the review
    const review = await reviewer.generateReview(diffContent);

    // Save the review
    await reviewer.saveReview(review, outputPath);
    console.log(`Review saved to ${outputPath}`);

    // Apply modifications if requested and available
    if (applyChanges && review.modifications && review.modifications.length > 0) {
      console.log('\nFound suggested modifications:');
      review.modifications.forEach((mod, index) => {
        console.log(`\n${index + 1}. ${mod.file} (${mod.priority})`);
        console.log('Original:', mod.original);
        console.log('Suggested:', mod.suggested);
      });

      const proceed = await askForConfirmation('\nDo you want to apply these modifications? (Y/n) ');
      if (proceed) {
        await reviewer.applyModifications(review);
        console.log('\nModifications applied successfully!');
      } else {
        console.log('\nModifications skipped.');
      }
    } else if (applyChanges) {
      console.log('\nNo modifications suggested in the review.');
    }

    // Generate documentation if requested
    if (generateDocs) {
      const commitMessages = await reviewer.getCommitMessages(branch);

      if (!diffContent) {
        throw new Error('No changes found to document');
      }

      const documentation = await reviewer.generateDocumentation(diffContent, commitMessages);
      const docOutput = await reviewer.formatDocumentationOutput(documentation);

      // Save to a documentation file
      const docPath = resolve(projectDir, 'CHANGES.md');
      await fs.writeFile(docPath, docOutput);
      console.log(`Documentation saved to ${docPath}`);
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
