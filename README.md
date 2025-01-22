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

## Usage

### Code Review Only

```bash
export OPENAI_API_KEY=your_api_key
ai-code-reviewer --branch=main
```

### Code Review with Auto-Apply

```bash
export OPENAI_API_KEY=your_api_key
ai-code-reviewer --branch=main --apply
```

### Generate Documentation

```bash
export OPENAI_API_KEY=your_api_key
ai-code-reviewer --branch=main --generate-docs
```

This will analyze your changes and commit messages to create a comprehensive CHANGES.md file documenting:

- High-level summary of changes
- Technical implementation details
- API changes
- Usage recommendations

### Quick Start with npx

```bash
npx ai-code-reviewer
```
