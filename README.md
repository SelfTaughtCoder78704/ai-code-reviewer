# AI Code Reviewer

An AI-powered code review tool that uses OpenAI to analyze code changes and provide detailed feedback.

## Installation Local
```bash
npm install ai-code-reviewer@latest
```

# Install Global
```bash
npm install -g ai-code-reviewer
```

## Usage for review only

```bash
export OPENAI_API_KEY=your_api_key
ai-code-reviewer --branch=main
```

## Usage for review and apply

```bash
export OPENAI_API_KEY=your_api_key
ai-code-reviewer --branch=main --apply
```
## Run with

```bash
npx ai-code-reviewer 
```
